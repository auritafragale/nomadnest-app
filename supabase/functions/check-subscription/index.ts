import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MEMBERSHIP_TIERS: Record<string, string> = {
  "prod_UJcVggxhZfowro": "sitter",
  "prod_UJcVTj7SmQp8V8": "owner",
  "prod_UJcVUVxwZ9yA2F": "combined",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    // Check if founding member first
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("founding_member, membership_status, membership_type")
      .eq("id", user.id)
      .single();

    if (profile?.founding_member) {
      // Ensure founding member profile is up to date
      if (profile.membership_status !== "active") {
        await supabaseClient
          .from("profiles")
          .update({ membership_status: "active", membership_type: "combined" })
          .eq("id", user.id);
      }
      return new Response(JSON.stringify({
        subscribed: true,
        membership_type: "combined",
        founding_member: true,
        subscription_end: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      await supabaseClient.from("profiles").update({
        membership_status: "none",
        membership_type: null,
      }).eq("id", user.id);

      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      await supabaseClient.from("profiles").update({
        membership_status: "none",
        membership_type: null,
      }).eq("id", user.id);

      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subscription = subscriptions.data[0];
    const productId = subscription.items.data[0].price.product as string;
    const membershipType = MEMBERSHIP_TIERS[productId] || "sitter";
    const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();

    await supabaseClient.from("profiles").update({
      membership_status: "active",
      membership_type: membershipType,
      membership_expiry: subscriptionEnd,
    }).eq("id", user.id);

    return new Response(JSON.stringify({
      subscribed: true,
      membership_type: membershipType,
      subscription_end: subscriptionEnd,
      founding_member: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
