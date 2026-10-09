import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { redact } from "../_shared/safe-log.ts";

// Deletes the caller's account and data (UK/EU data protection; app stores).
//
// Order matters:
//  1. Stripe: cancel every live subscription for this email immediately (no
//     proration, no refund). The Stripe customer and invoices are KEPT for
//     legal accounting retention (we store no Stripe id ourselves). If this
//     fails we stop: nothing is deleted and the member is never left paying
//     for a deleted account.
//  2. Collect every storage file to delete (account_storage_objects), BEFORE
//     rows go (chat and update photos are found through conversations/sits).
//  3. prepare_account_deletion: shared sits, daily update text, Welcome
//     Guide question history and chats stay for the other member ("Former
//     member"); reviews they wrote stay anonymised; reports/flags they filed
//     stay without them; safety records about them are kept 24 months
//     (deleted_accounts ledger, purged by privacy-retention); their own rows
//     without a cascading key are deleted; their active sits are cancelled.
//  4. Delete the files, bucket by bucket.
//  5. Onfido: delete the applicant (a failure is recorded, not fatal).
//  6. Delete the auth user: their profiles, listings (pets, dates, guides),
//     applications and the rest cascade; shared records are detached
//     (SET NULL) and kept.
// Every step is safe to retry. Logs contain ids and counts only.
//
// { dry_run: true }: read-only preview for testing (no Stripe writes, no
// database or storage changes): which subscriptions would be cancelled and
// how many files would be deleted.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ONFIDO_API_URL = "https://api.onfido.com/v3.6";
// Subscriptions that still bill or can start billing.
const LIVE_SUBSCRIPTION = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify({ fn: "delete-account", ...entry }));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "Please sign in again." }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user) return json({ error: "Please sign in again." }, 401);
  const userId = user.id;

  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("email, onfido_applicant_id")
      .eq("id", userId)
      .maybeSingle();
    const email = (profile?.email as string | null) ?? user.email ?? null;
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    // Not while a sit is confirmed or under way: the other member would be
    // left without a Nomad or a home. They cancel the sit first.
    const { count: liveSits } = await admin
      .from("sits")
      .select("id", { count: "exact", head: true })
      .in("status", ["confirmed", "in_progress"])
      .or(`owner_user_id.eq.${userId},sitter_user_id.eq.${userId}`);
    if ((liveSits ?? 0) > 0) {
      log({ user: userId, blocked: "live_sit", count: liveSits });
      return json({ error: "You have a confirmed sit. Please cancel it first, so no one is left without a Nomad or a home.", reason: "live_sit" }, 409);
    }

    // 1) Stripe: cancel live subscriptions; keep the customer and invoices.
    let stripeCancelled = 0;
    const toCancel: { id: string; status: string }[] = [];
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey && email) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        const customers = await stripe.customers.list({ email, limit: 10 });
        for (const customer of customers.data) {
          const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 });
          for (const sub of subs.data) {
            if (LIVE_SUBSCRIPTION.has(sub.status)) toCancel.push({ id: sub.id, status: sub.status });
          }
        }
        if (!dryRun) {
          for (const sub of toCancel) {
            await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
            stripeCancelled++;
          }
        }
      } catch (err) {
        log({ user: userId, step: "stripe", failed: redact(err) });
        return json(
          { error: "We couldn't cancel your membership just now, so nothing was deleted. Please try again in a few minutes." },
          502,
        );
      }
    }

    // 2) Files to delete (collected before any rows are removed)
    const { data: objects, error: objectsError } = await admin.rpc("account_storage_objects", { p_user_id: userId });
    if (objectsError) throw new Error(`listing files failed: ${objectsError.message}`);
    const byBucket = new Map<string, string[]>();
    for (const o of (objects ?? []) as { bucket_id: string; name: string }[]) {
      byBucket.set(o.bucket_id, [...(byBucket.get(o.bucket_id) ?? []), o.name]);
    }

    if (dryRun) {
      const filesByBucket = Object.fromEntries([...byBucket].map(([b, n]) => [b, n.length]));
      log({ user: userId, dry_run: true, subscriptions: toCancel.length, files: filesByBucket });
      return json({
        dry_run: true,
        stripe_configured: !!stripeKey,
        subscriptions_to_cancel: toCancel,
        files_to_delete: filesByBucket,
        onfido_applicant: !!profile?.onfido_applicant_id,
      });
    }

    // 3) Anonymise and delete rows that don't cascade
    const { data: prepared, error: prepareError } = await admin.rpc("prepare_account_deletion", { p_user_id: userId });
    if (prepareError) throw new Error(`prepare failed: ${prepareError.message}`);

    // 4) Files
    let filesDeleted = 0;
    for (const [bucket, names] of byBucket) {
      for (let i = 0; i < names.length; i += 100) {
        const { data: removed, error: removeError } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
        if (removeError) {
          log({ user: userId, step: "storage", bucket, failed: redact(removeError.message) });
        } else {
          filesDeleted += removed?.length ?? 0;
        }
      }
    }

    // 5) Onfido
    let onfidoDeleted: boolean | null = null;
    const applicantId = profile?.onfido_applicant_id as string | null;
    const onfidoToken = Deno.env.get("ONFIDO_API_TOKEN");
    if (applicantId && onfidoToken) {
      try {
        const res = await fetch(`${ONFIDO_API_URL}/applicants/${encodeURIComponent(applicantId)}`, {
          method: "DELETE",
          headers: { Authorization: `Token token=${onfidoToken}` },
        });
        onfidoDeleted = res.ok || res.status === 404;
        if (!onfidoDeleted) log({ user: userId, step: "onfido", status: res.status });
      } catch (err) {
        onfidoDeleted = false;
        log({ user: userId, step: "onfido", failed: redact(err) });
      }
    }

    const { error: ledgerError } = await admin
      .from("deleted_accounts")
      .update({
        stripe_subscriptions_cancelled: stripeCancelled,
        billing_records_retained: true,
        onfido_applicant_deleted: onfidoDeleted,
        storage_files_deleted: filesDeleted,
        notes: [
          "Stripe customer and invoices retained for legal accounting retention.",
          onfidoDeleted === false ? "Onfido applicant deletion failed: delete it in the Onfido dashboard." : null,
        ].filter(Boolean).join(" "),
      })
      .eq("user_id", userId);
    // The ledger row exists (prepare_account_deletion); a failed update only
    // loses these counts, so log it and carry on with the deletion.
    if (ledgerError) log({ user: userId, step: "ledger", failed: redact(ledgerError.message) });

    // 6) The account itself (everything else cascades)
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(`auth delete failed: ${deleteError.message}`);

    log({ user: userId, ok: true, stripe_cancelled: stripeCancelled, files: filesDeleted, onfido: onfidoDeleted, prepared });
    return json({ success: true });
  } catch (err) {
    log({ user: userId, failed: redact(err) });
    return json({ error: "We couldn't finish deleting your account. Please try again, or contact support." }, 500);
  }
});
