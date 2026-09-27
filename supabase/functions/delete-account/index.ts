import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";

// Deletes the caller's account and data (UK/EU data protection; app stores).
//
// Order matters:
//  1. Stripe: delete the customer(s) for this email, which cancels any
//     membership immediately. If this fails we stop: nothing is deleted and
//     the member is never left paying for a deleted account.
//  2. Collect every storage file to delete (account_storage_objects), BEFORE
//     rows go (chat and update photos are found through conversations/sits).
//  3. prepare_account_deletion: reviews they wrote and reports/flags they
//     filed are kept but anonymised; safety records about them are kept for
//     24 months (deleted_accounts ledger, purged by privacy-retention);
//     rows without a cascading key are deleted.
//  4. Delete the files, bucket by bucket.
//  5. Onfido: delete the applicant (a failure is recorded, not fatal).
//  6. Delete the auth user: profiles, listings, sits, conversations,
//     messages, applications and the rest cascade.
// Every step is safe to retry. Logs contain ids and counts only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ONFIDO_API_URL = "https://api.onfido.com/v3.6";

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

    // 1) Stripe
    let stripeDeleted = 0;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey && email) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        const customers = await stripe.customers.list({ email, limit: 10 });
        for (const customer of customers.data) {
          await stripe.customers.del(customer.id);
          stripeDeleted++;
        }
      } catch (err) {
        log({ user: userId, step: "stripe", failed: err instanceof Error ? err.message : String(err) });
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

    // 3) Anonymise and delete rows that don't cascade
    const { data: prepared, error: prepareError } = await admin.rpc("prepare_account_deletion", { p_user_id: userId });
    if (prepareError) throw new Error(`prepare failed: ${prepareError.message}`);

    // 4) Files
    let filesDeleted = 0;
    for (const [bucket, names] of byBucket) {
      for (let i = 0; i < names.length; i += 100) {
        const { data: removed, error: removeError } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
        if (removeError) {
          log({ user: userId, step: "storage", bucket, failed: removeError.message });
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
        log({ user: userId, step: "onfido", failed: err instanceof Error ? err.message : String(err) });
      }
    }

    await admin
      .from("deleted_accounts")
      .update({
        stripe_customers_deleted: stripeDeleted,
        onfido_applicant_deleted: onfidoDeleted,
        storage_files_deleted: filesDeleted,
        notes: onfidoDeleted === false ? "Onfido applicant deletion failed: delete it in the Onfido dashboard." : null,
      })
      .eq("user_id", userId);

    // 6) The account itself (everything else cascades)
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(`auth delete failed: ${deleteError.message}`);

    log({ user: userId, ok: true, stripe: stripeDeleted, files: filesDeleted, onfido: onfidoDeleted, prepared });
    return json({ success: true });
  } catch (err) {
    log({ user: userId, failed: err instanceof Error ? err.message : String(err) });
    return json({ error: "We couldn't finish deleting your account. Please try again, or contact support." }, 500);
  }
});
