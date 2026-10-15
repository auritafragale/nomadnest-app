import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { redact } from "../_shared/safe-log.ts";
import { appOrigin, customerIdFor } from "../_shared/stripe-plans.ts";
import { errorBody, getUserFailureReason, statusFor, type Reason } from "../_shared/http-status.ts";

// The Stripe billing portal (receipts, card, cancel). Opens in the same tab
// and comes back to /membership. { flow: "update_card" } goes straight to
// updating the card (the "Payment problem" state).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const fail = (reason: Reason, error: string, extra: Record<string, unknown> = {}) => json(errorBody(reason, error, extra), statusFor(reason));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return fail("auth_missing_token", "Please sign in first.");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return fail(getUserFailureReason(userError), "Your sign-in has ended. Please sign in again.");
    if (!user.email) return fail("no_email", "Please add an email to your account first.");

    const { data: profile } = await supabase.from("profiles").select("founding_member").eq("id", user.id).maybeSingle();
    if (profile?.founding_member) return fail("bad_input", "Founding members have nothing to pay, so there is no billing to manage.");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customerId = await customerIdFor(supabase, stripe, user.id);
    if (!customerId) return fail("bad_input", "No billing account found. Choose a plan to get started.");

    const body = await req.json().catch(() => ({}));
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appOrigin(req)}/membership?portal=done`,
      ...(body?.flow === "update_card" ? { flow_data: { type: "payment_method_update" as const } } : {}),
    });
    return json({ url: portalSession.url });
  } catch (error) {
    console.error("customer-portal failed:", redact(error));
    return json({ error: "We couldn't open billing just now. Please try again." }, 500);
  }
});
