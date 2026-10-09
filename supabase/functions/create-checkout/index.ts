import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { redact } from "../_shared/safe-log.ts";
import {
  PLANS,
  appOrigin,
  customerIdFor,
  isPlan,
  liveSubscription,
  periodEndOf,
  planForPrice,
  planOf,
  planRank,
  type Plan,
} from "../_shared/stripe-plans.ts";

// Start or change a membership.
// * No live subscription: a Stripe Checkout session (opens in the same tab
//   and comes back to /membership).
// * A live subscription, moving up to Combined: the SAME subscription is
//   changed, with proration (credit for what is left of the current plan,
//   the difference charged now). Never a second subscription.
// * Moving down or across (Combined to one side, Nomad to Pet Parent): the
//   change is scheduled for the renewal date.
// Only the three known plans are accepted.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Please sign in first.", reason: "auth_missing_token" }, 401);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user?.email) return json({ error: "Your sign-in has ended. Please sign in again.", reason: "auth_get_user_failed" }, 401);

    const body = await req.json().catch(() => ({}));
    // A plan name, or (older app versions) one of our price ids. Anything else is refused.
    const plan: Plan | null = isPlan(body?.plan) ? body.plan : typeof body?.priceId === "string" ? planForPrice(body.priceId) : null;
    if (!plan) return json({ error: "That plan isn't available." }, 400);
    const price = PLANS[plan].price;

    const { data: profile } = await supabase.from("profiles").select("founding_member").eq("id", user.id).maybeSingle();
    if (profile?.founding_member) return json({ error: "You're a Founding member: Combined is yours for life." }, 400);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customerId = await customerIdFor(supabase, stripe, user.id, user.email);
    const current = customerId ? await liveSubscription(stripe, customerId) : null;

    if (current) {
      const item = current.items.data[0];
      const currentPlan = planOf(item?.price);
      if (currentPlan === plan && !current.cancel_at_period_end) {
        return json({ error: "You already have this plan." }, 400);
      }
      if (currentPlan === plan && current.cancel_at_period_end) {
        // "Keep my membership".
        await stripe.subscriptions.update(current.id, { cancel_at_period_end: false });
        return json({ updated: true, plan });
      }

      if (currentPlan && planRank(plan) > planRank(currentPlan)) {
        // Upgrade now, on the same subscription, with proration.
        if (current.schedule) {
          const schedId = typeof current.schedule === "string" ? current.schedule : current.schedule.id;
          await stripe.subscriptionSchedules.release(schedId).catch(() => {});
        }
        await stripe.subscriptions.update(current.id, {
          items: [{ id: item.id, price }],
          proration_behavior: "always_invoice",
          payment_behavior: "pending_if_incomplete",
          cancel_at_period_end: false,
          metadata: { ...current.metadata, user_id: user.id, plan },
        });
        console.log(JSON.stringify({ fn: "create-checkout", action: "upgrade", user: user.id, to: plan }));
        return json({ updated: true, plan });
      }

      // Down or across: from the renewal date.
      const periodEnd = periodEndOf(current);
      const endUnix = periodEnd ? Math.floor(Date.parse(periodEnd) / 1000) : null;
      if (!endUnix) return json({ error: "We couldn't change your plan just now. Please try again." }, 500);
      const schedule = current.schedule
        ? await stripe.subscriptionSchedules.retrieve(typeof current.schedule === "string" ? current.schedule : current.schedule.id)
        : await stripe.subscriptionSchedules.create({ from_subscription: current.id });
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: "release",
        phases: [
          { items: [{ price: item.price.id, quantity: 1 }], start_date: schedule.phases[0].start_date, end_date: endUnix },
          { items: [{ price, quantity: 1 }], metadata: { user_id: user.id, plan } },
        ],
      });
      console.log(JSON.stringify({ fn: "create-checkout", action: "scheduled", user: user.id, to: plan }));
      return json({ scheduled: true, plan, effective: periodEnd });
    }

    // New membership: Stripe Checkout.
    const origin = appOrigin(req);
    const session = await stripe.checkout.sessions.create({
      customer: customerId ?? undefined,
      customer_email: customerId ? undefined : user.email,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      mode: "subscription",
      subscription_data: { metadata: { user_id: user.id, plan } },
      metadata: { user_id: user.id, plan },
      success_url: `${origin}/membership?checkout=success`,
      cancel_url: `${origin}/membership?checkout=cancelled`,
    });
    return json({ url: session.url });
  } catch (error) {
    console.error("create-checkout failed:", redact(error));
    return json({ error: "We couldn't open the payment page just now. Please try again." }, 500);
  }
});
