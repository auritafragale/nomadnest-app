import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const APP_URL = "https://nomadnest.global";

const MEMBERSHIP_TIERS: Record<string, string> = {
  "prod_UJcVggxhZfowro": "sitter",
  "prod_UJcVTj7SmQp8V8": "owner",
  "prod_UJcVUVxwZ9yA2F": "combined",
};

const PLAN_NAMES: Record<string, string> = {
  sitter: "Nomad Membership",
  owner: "Pet Parent Membership",
  combined: "Combined Membership",
};

const sendEmail = async (to: string, subject: string, html: string) => {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured, skipping email to", to);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "NomadNest <noreply@nomadnest.global>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    console.error(`Resend failed [${response.status}]: ${error}`);
  } else {
    console.log(`Membership email sent to ${to}: ${subject}`);
  }
};

const wrapHtml = (body: string) => `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
      a { color: #E8735A; }
      h2 { color: #E8735A; }
    </style>
  </head>
  <body>
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://nomadnest.global/logo-email.png" alt="NomadNest" style="max-width: 160px;" />
    </div>
    ${body}
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    <p style="font-size: 12px; color: #888;">
      You're receiving this because you have a NomadNest membership.
      <a href="${APP_URL}/settings">Manage your email preferences</a>
    </p>
  </body>
  </html>
`;

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

// Look up the member's profile (id + name) by email for notifications.
const getProfileByEmail = async (supabase: any, email: string) => {
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name")
    .eq("email", email)
    .maybeSingle();
  return data as { id: string; first_name: string | null } | null;
};

const insertNotification = async (
  supabase: any,
  userId: string,
  title: string,
  message: string
) => {
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type: "membership",
    title,
    message,
    data: { url: "/membership" },
  });
  if (error) console.error("Could not create in-app notification:", error);
};

const membershipEmailEnabled = async (supabase: any, userId: string) => {
  const { data } = await supabase
    .from("notification_preferences")
    .select("email_membership")
    .eq("user_id", userId)
    .maybeSingle();
  // Default to sending when the column/row doesn't exist.
  return data?.email_membership !== false;
};

const sendMembershipEmail = async (
  supabase: any,
  email: string,
  kind: "activated" | "cancelled" | "payment_failed" | "renewal_reminder",
  details: { planName?: string; endDate?: string | null; amount?: string | null }
) => {
  const profile = await getProfileByEmail(supabase, email);
  const name = profile?.first_name ? ` ${profile.first_name}` : "";

  let subject = "";
  let title = "";
  let message = "";
  let body = "";

  switch (kind) {
    case "activated":
      subject = `Welcome aboard — your ${details.planName ?? "membership"} is active 🎉`;
      title = "Membership active";
      message = `Your ${details.planName ?? "membership"} is now active.`;
      body = `
        <h2>You're in${name}!</h2>
        <p>Your <strong>${details.planName ?? "NomadNest membership"}</strong> is now active.</p>
        ${details.endDate ? `<p>It renews on <strong>${fmtDate(details.endDate)}</strong>.</p>` : ""}
        <p>Time to make the most of it:</p>
        <p>
          <a href="${APP_URL}/browse-sits">Browse sits</a> &nbsp;·&nbsp;
          <a href="${APP_URL}/browse-sitters">Find Nomads</a> &nbsp;·&nbsp;
          <a href="${APP_URL}/perks">Member Perks</a>
        </p>
      `;
      break;
    case "cancelled":
      subject = "Your NomadNest membership has been cancelled";
      title = "Membership cancelled";
      message = "Your membership has been cancelled.";
      body = `
        <h2>Sorry to see you go${name}</h2>
        <p>Your NomadNest membership has been cancelled and your access has ended.</p>
        <p>You can rejoin any time — your profile, reviews and messages are still here waiting for you.</p>
        <p><a href="${APP_URL}/membership">Rejoin NomadNest</a></p>
      `;
      break;
    case "payment_failed":
      subject = "Action needed: your membership payment failed";
      title = "Payment failed";
      message = "Your membership payment failed — please update your card.";
      body = `
        <h2>Payment issue${name}</h2>
        <p>We couldn't take payment for your NomadNest membership${details.amount ? ` (<strong>${details.amount}</strong>)` : ""}.</p>
        <p>Please update your payment method soon to keep your membership active — if payment keeps failing, your access will be paused.</p>
        <p><a href="${APP_URL}/dashboard">Update your payment method</a> (Membership → Manage Subscription)</p>
      `;
      break;
    case "renewal_reminder":
      subject = "Your NomadNest membership renews soon";
      title = "Membership renewal coming up";
      message = "Your membership renews in a few days.";
      body = `
        <h2>Heads up${name}</h2>
        <p>Your NomadNest membership will renew in the next few days${details.endDate ? `, on <strong>${fmtDate(details.endDate)}</strong>` : ""}.</p>
        <p>No action needed if you'd like to stay — and thank you for being part of the community.</p>
        <p><a href="${APP_URL}/dashboard">Manage your membership</a></p>
      `;
      break;
  }

  if (profile) {
    await insertNotification(supabase, profile.id, title, message);
    // Billing-critical emails (payment failed) always send; others respect prefs.
    if (kind !== "payment_failed") {
      const enabled = await membershipEmailEnabled(supabase, profile.id);
      if (!enabled) {
        console.log(`Membership emails disabled for user ${profile.id}, skipping ${kind}`);
        return;
      }
    }
  }

  await sendEmail(email, subject, wrapHtml(body));
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
        const email = (customer as Stripe.Customer).email;

        await supabase
          .from("profiles")
          .update({
            membership_status: "none",
            membership_type: null,
            membership_expiry: null,
          })
          .eq("email", email);

        if (email) {
          await sendMembershipEmail(supabase, email, "cancelled", {});
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) break;
        const email = (customer as Stripe.Customer).email;

        // Mark as past_due but keep membership_type so the user sees what lapsed.
        await supabase
          .from("profiles")
          .update({ membership_status: "past_due" })
          .eq("email", email);

        if (email) {
          const amount = typeof invoice.amount_due === "number"
            ? `£${(invoice.amount_due / 100).toFixed(2)}`
            : null;
          await sendMembershipEmail(supabase, email, "payment_failed", { amount });
        }
        break;
      }

      case "invoice.upcoming": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        if (!customerId) break;
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) break;
        const email = (customer as Stripe.Customer).email;

        if (email) {
          const periodEnd = (invoice as unknown as { period_end?: number }).period_end;
          const endDate = typeof periodEnd === "number"
            ? new Date(periodEnd * 1000).toISOString()
            : null;
          await sendMembershipEmail(supabase, email, "renewal_reminder", { endDate });
        }
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
  // In API version 2025-08-27.basil the period fields live on the subscription
  // item, not the subscription. Fall back to the legacy top-level field.
  const periodEnd =
    (sub.items.data[0] as { current_period_end?: number })?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  const expiry =
    typeof periodEnd === "number" && Number.isFinite(periodEnd)
      ? new Date(periodEnd * 1000).toISOString()
      : null;
  const isActive = sub.status === "active" || sub.status === "trialing";

  // Only send the "welcome" email when transitioning INTO an active state,
  // not on every subscription.updated event (e.g. renewals, metadata changes).
  const { data: existing } = await supabase
    .from("profiles")
    .select("membership_status")
    .eq("email", email)
    .maybeSingle();
  const wasActive =
    existing?.membership_status === "active" || existing?.membership_status === "trialing";

  await supabase
    .from("profiles")
    .update({
      membership_status: isActive ? "active" : sub.status,
      membership_type: isActive ? membershipType : null,
      membership_expiry: isActive ? expiry : null,
    })
    .eq("email", email);

  if (isActive && !wasActive) {
    await sendMembershipEmail(supabase, email, "activated", {
      planName: PLAN_NAMES[membershipType],
      endDate: expiry,
    });
  }
}
