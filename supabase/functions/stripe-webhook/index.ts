import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const MEMBERSHIP_TIERS: Record<string, string> = {
  "prod_UJcVggxhZfowro": "sitter",
  "prod_UJcVTj7SmQp8V8": "owner",
  "prod_UJcVUVxwZ9yA2F": "combined",
};

serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey || !webhookSecret) {
    return new Response("Server misconfiguration", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  // Verify Stripe signature — reject anything that doesn't match.
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err.message}`, {
      status: 400,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    switch (event.type) {
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(supabase, stripe, sub);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(sub.customer as string);
        if (customer.deleted) break;

        await supabase
          .from("profiles")
          .update({
            membership_status: "none",
            membership_type: null,
            membership_expiry: null,
          })
          .eq("email", (customer as Stripe.Customer).email);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) break;

        // Mark as past_due but keep membership_type so the user sees what lapsed.
        await supabase
          .from("profiles")
          .update({ membership_status: "past_due" })
          .eq("email", (customer as Stripe.Customer).email);
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt so Stripe doesn't retry.
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response(`Handler error: ${err.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function syncSubscription(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  sub: Stripe.Subscription
) {
  const customer = await stripe.customers.retrieve(sub.customer as string);
  if (customer.deleted) return;

  const email = (customer as Stripe.Customer).email;
  if (!email) return;

  const productId = sub.items.data[0]?.price?.product as string;
  const membershipType = MEMBERSHIP_TIERS[productId] || "sitter";
  const expiry = new Date(sub.current_period_end * 1000).toISOString();
  const isActive = sub.status === "active" || sub.status === "trialing";

  await supabase
    .from("profiles")
    .update({
      membership_status: isActive ? "active" : sub.status,
      membership_type: isActive ? membershipType : null,
      membership_expiry: isActive ? expiry : null,
    })
    .eq("email", email);
}
