import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { renderBrandedEmail, sendBrandedEmail, APP_URL, BRAND } from "../_shared/branded-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const step = (icon: string, title: string, text: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
    <tr>
      <td width="44" valign="top" style="font-size:26px;line-height:32px;">${icon}</td>
      <td valign="top">
        <p style="margin:0;color:${BRAND.dark};font-weight:bold;font-size:16px;line-height:24px;">${title}</p>
        <p style="margin:2px 0 0;color:${BRAND.body};font-size:15px;line-height:23px;">${text}</p>
      </td>
    </tr>
  </table>`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("INTERNAL_TRIGGER_SECRET");
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", user_id)
      .maybeSingle();

    if (!profile?.email) {
      return new Response(JSON.stringify({ message: "No recipient" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstName = (profile.first_name ?? "").trim() || "there";

    const html = renderBrandedEmail(
      {
        heading: `Welcome to NomadNest, ${firstName}! 🎉`,
        body: `
    <img src="https://nomadnest.global/hero-pets-home.jpg" alt="A dog and cat relaxing at home" style="width:100%;border-radius:10px;margin-bottom:24px;" />
    <p style="margin:0 0 24px;">NomadNest connects Nomads — people who love to travel — with Pet Parents who need someone to care for their home and pets while they're away. No booking fees and no nightly rates: Nomads stay for free in exchange for looking after the home and pets.</p>
    <p style="margin:0 0 16px;color:${BRAND.dark};font-size:18px;font-weight:bold;">How it works</p>
    ${step("🔍", "Browse &amp; Connect", "Explore sits worldwide, or browse trusted Nomads nearby.")}
    ${step("🤝", "Apply or Invite", "Send an application or invite someone directly, and chat first to make sure it's a good fit.")}
    ${step("🏡", "Sit &amp; Enjoy", "Care for the home and pets, log daily check-ins, and leave a review when you're done.")}
    <p style="margin:24px 0 0;">Happy travels,<br />The NomadNest Team</p>
  `,
        ctaLabel: "Complete your profile",
        ctaUrl: `${APP_URL}/complete-profile`,
      },
      {
        preview: "Free pet sitting, free stays, here's how it works.",
        footerReason: "You're receiving this because you just joined NomadNest.",
      }
    );

    await sendBrandedEmail(profile.email, "Welcome to NomadNest! 🏡", html);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-welcome-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
