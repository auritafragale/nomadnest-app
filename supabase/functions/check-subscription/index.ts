import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { redact } from "../_shared/safe-log.ts";
import { customerIdFor, liveSubscription, periodEndOf, planOf, syncSubscription } from "../_shared/stripe-plans.ts";

// The member's membership for the Membership page and Settings. Reads Stripe
// and brings the profile in line (the webhook normally does that already).
// Card brand and last 4 digits only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const NONE = { subscribed: false, membership_type: null, founding_member: false, subscription_end: null, status: "none" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json(NONE);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user?.email) return json({ ...NONE, reason: "auth_get_user_failed" }, 401);

    const { data: profile } = await supabase
      .from("profiles")
      .select("founding_member, membership_payment_failed_at")
      .eq("id", user.id)
      .single();

    if (profile?.founding_member) {
      return json({ subscribed: true, membership_type: "combined", founding_member: true, subscription_end: null, status: "active" });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customerId = await customerIdFor(supabase, stripe, user.id, user.email);
    const sub = customerId ? await liveSubscription(stripe, customerId) : null;

    if (!sub) {
      await supabase
        .from("profiles")
        .update({ membership_status: "none", membership_type: null, membership_expiry: null, membership_cancel_at_period_end: false })
        .eq("id", user.id);
      return json(NONE);
    }

    const { status } = await syncSubscription(supabase, user.id, sub, false);

    // Card summary from the default payment method (brand and last 4 only).
    let card: { brand: string | null; last4: string | null } = { brand: null, last4: null };
    try {
      const pmId = (sub.default_payment_method as string | null) ?? null;
      const customer = await stripe.customers.retrieve(customerId!);
      const fallback = !customer.deleted ? ((customer as Stripe.Customer).invoice_settings?.default_payment_method as string | null) : null;
      const id = pmId ?? fallback;
      if (id && typeof id === "string" && id.startsWith("pm_")) {
        const pm = await stripe.paymentMethods.retrieve(id);
        if (pm.card) card = { brand: pm.card.brand, last4: pm.card.last4 };
      }
    } catch {
      // Not critical.
    }

    // A change already booked for the renewal date (a move down or across).
    let pending: string | null = null;
    try {
      if (sub.schedule) {
        const sched = await stripe.subscriptionSchedules.retrieve(typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id, {
          expand: ["phases.items.price"],
        });
        const next = sched.phases[1]?.items[0]?.price;
        pending = planOf(typeof next === "string" ? null : (next as Stripe.Price)) ?? null;
      }
    } catch {
      // Not critical.
    }

    return json({
      subscribed: status === "active" || status === "past_due",
      status,
      membership_type: planOf(sub.items.data[0]?.price),
      subscription_end: periodEndOf(sub),
      cancel_at_period_end: !!sub.cancel_at_period_end,
      payment_failed_at: profile?.membership_payment_failed_at ?? null,
      pending_plan: pending,
      founding_member: false,
      card_brand: card.brand,
      card_last4: card.last4,
    });
  } catch (error) {
    console.error("check-subscription failed:", redact(error));
    return json({ error: "We couldn't check your membership just now." }, 500);
  }
});
