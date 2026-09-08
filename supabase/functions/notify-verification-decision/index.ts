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

    const { data: row } = await admin
      .from("manual_id_verifications")
      .select("id, user_id, status, notes")
      .eq("id", verification_id)
      .maybeSingle();

    if (!row || (row.status !== "approved" && row.status !== "rejected")) {
      return new Response(JSON.stringify({ message: "No decision to send" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("email, first_name")
      .eq("id", row.user_id)
      .maybeSingle();

    if (!profile?.email) {
      return new Response(JSON.stringify({ error: "User email not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstName = profile.first_name || "there";
    const approved = row.status === "approved";

    const html = renderBrandedEmail(
      approved
        ? {
            heading: "Your identity is verified",
            body: `
    <p>Hi ${firstName},</p>
    <p>Great news — your identity has been verified. Your verified badge is now visible
    to the community, and you can apply for sits and publish listings.</p>
  `,
            ctaLabel: "Go to your dashboard",
            ctaUrl: `${APP_URL}/dashboard`,
          }
        : {
            heading: "Your ID verification was unsuccessful",
            body: `
    <p>Hi ${firstName},</p>
    <p>Thank you for submitting your ID. Unfortunately we weren't able to approve it.</p>
    ${
      row.notes
        ? `<blockquote style="border-left:3px solid #E8735A;padding-left:12px;color:#555;margin:16px 0;">${row.notes}</blockquote>`
        : ""
    }
    <p>You can resubmit at any time with the issue resolved. If you're unsure what to do,
    email us at <a href="mailto:support@nomadnest.global">support@nomadnest.global</a>.</p>
  `,
            ctaLabel: "Resubmit verification",
            ctaUrl: `${APP_URL}/verify-identity`,
          },
      {
        preview: approved
          ? "Your NomadNest identity verification was approved"
          : "Your NomadNest identity verification needs another look",
        footerReason: "You're receiving this because you submitted an ID verification on NomadNest.",
      }
    );

    const emailResponse = await sendBrandedEmail(
      profile.email,
      approved ? "Your identity is verified" : "Your ID verification was unsuccessful",
      html
    );

    return new Response(JSON.stringify({ success: true, email: emailResponse }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-verification-decision error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
