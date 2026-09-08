import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { renderBrandedEmail, sendBrandedEmail, APP_URL } from "../_shared/branded-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { verification_id } = await req.json();
    if (!verification_id) {
      return new Response(JSON.stringify({ error: "Missing verification_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Everything is derived from the database row, so the payload can only ever
    // trigger an email about a real pending submission.
    const { data: row } = await admin
      .from("manual_id_verifications")
      .select("id, user_id, status, created_at")
      .eq("id", verification_id)
      .maybeSingle();

    if (!row || row.status !== "pending") {
      return new Response(JSON.stringify({ message: "No pending submission" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: member } = await admin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", row.user_id)
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

    const html = renderBrandedEmail(
      {
        heading: "New ID verification to review",
        body: `
    <p><strong>${memberName}</strong> has submitted their photo ID and selfie for manual review.</p>
    <p>Submitted: ${new Date(row.created_at).toUTCString()}</p>
    <p>Open the admin verifications page to approve or reject the submission.</p>
  `,
        ctaLabel: "Review submission",
        ctaUrl: `${APP_URL}/admin/verifications`,
      },
      {
        preview: `${memberName} submitted ID verification`,
        footerReason: "You're receiving this because you are a NomadNest administrator.",
      }
    );

    for (const to of recipients) {
      try {
        await sendBrandedEmail(to, "New ID verification awaiting review", html);
      } catch (err) {
        console.error("Failed to email admin", to, err);
      }
    }

    return new Response(JSON.stringify({ success: true, notified: recipients.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-admin-verification-submitted error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
