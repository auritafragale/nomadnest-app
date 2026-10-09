import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { renderBrandedEmail, sendBrandedEmail } from "../_shared/branded-email.ts";
import { buildMembershipEmail, type MembershipEmailKind } from "../_shared/email-templates.ts";
import { maskEmail, redact } from "../_shared/safe-log.ts";
import { PLANS, findMember, syncSubscription } from "../_shared/stripe-plans.ts";

// Stripe → membership. Every request must carry a valid Stripe signature.
// Each event is handled once (public.stripe_events). The member's profile is
// written here with the service role only; their roles follow the plan
// through the roles_follow_plan trigger. Members can never write any of it.
//
// Events: checkout.session.completed, customer.subscription.created /
// updated / deleted, invoice.paid, invoice.payment_failed, invoice.upcoming.

// deno-lint-ignore no-explicit-any
type Supa = any;

const notify = async (supabase: Supa, userId: string, type: "membership" | "membership_payment_failed", title: string, message: string) => {
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type,
    title,
    message,
    data: { url: "/membership" },
  });
  if (error) console.error("Could not create in-app notification:", redact(error));
};

/** In-app row plus email. Payment problems always email; others follow the member's choice. */
const membershipMessage = async (
  supabase: Supa,
  member: { id: string; email: string | null },
  kind: MembershipEmailKind,
  details: { planName?: string; endDate?: string | null; amount?: string | null },
) => {
  const { data: profile } = await supabase.from("profiles").select("first_name").eq("id", member.id).maybeSingle();
  const content = buildMembershipEmail(kind, { ...details, name: profile?.first_name });
  const type = kind === "payment_failed" ? "membership_payment_failed" : "membership";
  await notify(supabase, member.id, type, content.pushTitle ?? content.subject, content.pushBody ?? "");
  if (!member.email) return;
  const { data: allowed } = await supabase.rpc("notification_allowed", { p_user_id: member.id, p_type: type, p_channel: "email" });
  if (allowed === false) return;
  try {
    await sendBrandedEmail(member.email, content.subject, renderBrandedEmail(content, { preview: content.preview, footerReason: content.footerReason }));
    console.log(`Membership email (${kind}) sent to ${maskEmail(member.email)}`);
  } catch (err) {
    console.error(String(redact(err)));
  }
};

serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return new Response("Server misconfiguration", { status: 500 });

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  // Verify the Stripe signature: reject anything that doesn't match.
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch {
    return new Response("Webhook signature verification failed", { status: 400 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  // Already handled? Stripe retries and sometimes sends an event twice.
  const { data: seen } = await supabase.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { "Content-Type": "application/json" } });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.subscription) break;
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        if (!sub.metadata?.user_id && session.client_reference_id) sub.metadata = { ...sub.metadata, user_id: session.client_reference_id };
        await handleSubscription(supabase, stripe, sub);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscription(supabase, stripe, event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const member = await findMember(supabase, stripe, sub);
        if (!member) break;
        // Only the member's current subscription ends their membership (an
        // old one ending, for example after an upgrade, changes nothing).
        if (member.founding_member || (member.stripe_subscription_id && member.stripe_subscription_id !== sub.id)) break;
        await supabase
          .from("profiles")
          .update({
            membership_status: "none",
            membership_type: null,
            membership_expiry: null,
            membership_cancel_at_period_end: false,
            membership_payment_failed_at: null,
            stripe_subscription_id: null,
          })
          .eq("id", member.id);
        await membershipMessage(supabase, member, "cancelled", {});
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const member = await findMember(supabase, stripe, { customer: invoice.customer as string, metadata: invoice.parent?.subscription_details?.metadata ?? null });
        if (!member || member.founding_member) break;
        await supabase
          .from("profiles")
          .update({ membership_status: "past_due", membership_payment_failed_at: new Date().toISOString() })
          .eq("id", member.id);
        const amount = typeof invoice.amount_due === "number" ? `£${(invoice.amount_due / 100).toFixed(2)}` : null;
        await membershipMessage(supabase, member, "payment_failed", { amount });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const member = await findMember(supabase, stripe, { customer: invoice.customer as string, metadata: invoice.parent?.subscription_details?.metadata ?? null });
        if (!member || member.founding_member) break;
        const subId = invoice.parent?.subscription_details?.subscription;
        if (subId) await handleSubscription(supabase, stripe, await stripe.subscriptions.retrieve(typeof subId === "string" ? subId : subId.id));
        break;
      }

      case "invoice.upcoming": {
        const invoice = event.data.object as Stripe.Invoice;
        const member = await findMember(supabase, stripe, { customer: invoice.customer as string, metadata: invoice.parent?.subscription_details?.metadata ?? null });
        if (!member || member.founding_member) break;
        const periodEnd = (invoice as unknown as { period_end?: number }).period_end;
        await membershipMessage(supabase, member, "renewal_reminder", {
          endDate: typeof periodEnd === "number" ? new Date(periodEnd * 1000).toISOString() : null,
        });
        break;
      }

      default:
        // Acknowledge so Stripe doesn't retry.
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", redact(err));
    // Not recorded: Stripe will retry it.
    return new Response("Handler error", { status: 500 });
  }

  await supabase.from("stripe_events").insert({ id: event.id, type: event.type });
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});

async function handleSubscription(supabase: Supa, stripe: Stripe, sub: Stripe.Subscription) {
  const member = await findMember(supabase, stripe, sub);
  if (!member) {
    console.log(JSON.stringify({ fn: "stripe-webhook", skipped: "member_not_found", subscription: sub.id }));
    return;
  }
  const wasActive = member.membership_status === "active" || member.membership_status === "trialing";
  const { status, plan } = await syncSubscription(supabase, member.id, sub, member.founding_member);
  if (status === "active" && !wasActive && !member.founding_member) {
    await membershipMessage(supabase, member, "activated", { planName: plan ? PLANS[plan].name : undefined });
  }
}
