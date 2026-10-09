import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { redact } from "../_shared/safe-log.ts";
import { customerIdFor, liveSubscription, periodEndOf } from "../_shared/stripe-plans.ts";

// Redeem a founding invite code (members can no longer do this from the
// browser). In this order:
// 1. redeem_founding_code_for() checks the code, the 1,000 cap and that the
//    member hasn't redeemed before, and makes them Founding Combined for life.
// 2. Any paid subscription is cancelled straight away and the unused part of
//    the last payment is refunded. The webhook leaves founding members alone,
//    so the cancellation can't take their membership away.
// Logs: ids, outcome and amounts in pence only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const log = (entry: Record<string, unknown>) => console.log(JSON.stringify({ fn: "redeem-founding-code", ...entry }));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Please sign in first.", reason: "auth_missing_token" }, 401);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return json({ error: "Your sign-in has ended. Please sign in again.", reason: "auth_get_user_failed" }, 401);

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim().slice(0, 100) : "";
    if (!code) return json({ result: "invalid" });

    const { data: outcome, error } = await supabase.rpc("redeem_founding_code_for", { p_user_id: user.id, p_code: code });
    if (error) throw new Error(`redeem failed: ${error.code ?? ""}`);
    if (outcome !== "ok") {
      log({ user: user.id, outcome: String(outcome).slice(0, 12) });
      return json({ result: outcome });
    }

    // Founding now. Cancel and refund any paid plan.
    let refunded: number | null = null;
    let refundPending = false;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey && user.email) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      try {
        const customerId = await customerIdFor(supabase, stripe, user.id, user.email);
        const sub = customerId ? await liveSubscription(stripe, customerId) : null;
        if (sub) {
          // The unused part of the last paid invoice, by time left.
          const item = sub.items.data[0] as { current_period_start?: number } | undefined;
          const start = item?.current_period_start ?? 0;
          const endIso = periodEndOf(sub);
          const end = endIso ? Math.floor(Date.parse(endIso) / 1000) : 0;
          const now = Math.floor(Date.now() / 1000);
          if (sub.schedule) {
            await stripe.subscriptionSchedules.release(typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id).catch(() => {});
          }
          const invoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
          await stripe.subscriptions.cancel(sub.id, { prorate: false, invoice_now: false });

          if (invoiceId && end > now && end > start) {
            const invoice = await stripe.invoices.retrieve(invoiceId);
            const paid = invoice.amount_paid ?? 0;
            const amount = Math.floor((paid * (end - now)) / (end - start));
            if (amount > 0) {
              const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 5 });
              const pi = (payments.data as Stripe.InvoicePayment[]).find((p: Stripe.InvoicePayment) => p.status === "paid")?.payment?.payment_intent;
              const paymentIntent = typeof pi === "string" ? pi : pi?.id;
              if (paymentIntent) {
                await stripe.refunds.create({ payment_intent: paymentIntent, amount, metadata: { reason: "founding_code", user_id: user.id } });
                refunded = amount;
              } else {
                refundPending = true;
              }
            }
          }
          log({ user: user.id, cancelled: sub.id, refunded_pence: refunded, refund_pending: refundPending });
        }
      } catch (err) {
        // The member is Founding either way; the team sorts the refund out.
        refundPending = true;
        console.error("redeem-founding-code stripe step failed:", redact(err));
      }
    }

    return json({ result: "ok", refunded_pence: refunded, refund_pending: refundPending });
  } catch (err) {
    console.error("redeem-founding-code failed:", redact(err));
    return json({ error: "We couldn't redeem that code just now. Please try again." }, 500);
  }
});
