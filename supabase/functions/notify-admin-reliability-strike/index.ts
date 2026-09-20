import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { renderBrandedEmail, sendBrandedEmail, APP_URL } from "../_shared/branded-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only the database trigger (handle_sit_cancellation_trust) may call this function.
  const expectedSecret = Deno.env.get("INTERNAL_TRIGGER_SECRET");
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id, strike_count } = await req.json();
    if (!user_id || !strike_count) {
      return new Response(JSON.stringify({ error: "Missing user_id or strike_count" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: member } = await admin
      .from("profiles")
      .select("first_name, last_name, email, reliability_score")
      .eq("id", user_id)
      .maybeSingle();

    const { data: admins } = await admin
      .from("profiles")
      .select("email")
      .eq("is_admin", true);

    const recipients = (admins ?? []).map((a: { email: string }) => a.email).filter(Boolean);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ message: "No admins to notify" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const memberName =
      [member?.first_name, member?.last_name].filter(Boolean).join(" ") ||
      member?.email ||
      "A member";
    const reliabilityScore = member?.reliability_score ?? 100;

    const html = renderBrandedEmail(
      {
        heading: "Reliability strike logged",
        body: `
    <p><strong>${memberName}</strong> has now cancelled <strong>${strike_count}</strong> confirmed sits late (within 7 days of start).</p>
    <p>Reliability score: <strong>${reliabilityScore}</strong></p>
  `,
        ctaLabel: "Review in Trust & Safety",
        ctaUrl: `${APP_URL}/admin/trust`,
      },
      {
        preview: `${memberName} has ${strike_count} late cancellations`,
        footerReason: "You're receiving this because you are a NomadNest administrator.",
      }
    );

    for (const to of recipients) {
      try {
        await sendBrandedEmail(to, `Reliability strike: ${memberName}`, html);
      } catch (err) {
        console.error("Failed to email admin", to, err);
      }
    }

    return new Response(JSON.stringify({ success: true, notified: recipients.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-admin-reliability-strike error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
