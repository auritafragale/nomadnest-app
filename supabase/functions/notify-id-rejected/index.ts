import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  userId: string;
  reason: string;
  notes?: string;
}

const buildHtml = (firstName: string | null, reason: string, notes?: string) => `
  <!DOCTYPE html>
  <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="https://nomadnest.global/logo-email.png" alt="NomadNest" style="max-width:160px;margin-bottom:24px;" />
      </div>
      <h2 style="color:#1A1A1A;">Your ID verification was unsuccessful</h2>
      <p>Hi ${firstName || "there"},</p>
      <p>Thank you for submitting your ID for verification. Unfortunately we weren't able to approve it for the following reason:</p>
      <blockquote style="border-left: 3px solid #E8735A; padding-left: 12px; color: #555; margin: 16px 0;">
        ${reason}
        ${notes ? `<br/><br/><em>${notes}</em>` : ""}
      </blockquote>
      <p>Please resubmit your verification with the issue resolved. If you're unsure what to do, contact us at <a href="mailto:support@nomadnest.global">support@nomadnest.global</a> and we'll help you out.</p>
      <p style="margin-top:24px;">The NomadNest Team</p>
    </body>
  </html>
`;

const sendEmail = async (to: string, subject: string, html: string) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "NomadNest <noreply@nomadnest.global>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Failed to send email");
  }
  return res.json();
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, reason, notes }: Payload = await req.json();
    if (!userId || !reason) {
      return new Response(JSON.stringify({ error: "Missing userId or reason" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Look up email + name from profiles
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("email, first_name")
      .eq("id", userId)
      .single();

    if (profileErr || !profile?.email) {
      // Fallback: try auth.users
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (!email) {
        console.error("Could not find user email", profileErr);
        return new Response(JSON.stringify({ error: "User email not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      profile && (profile.email = email);
    }

    const email = profile?.email!;
    const firstName = profile?.first_name ?? null;

    // Insert in-app notification
    const { error: notifErr } = await admin.from("notifications").insert({
      user_id: userId,
      type: "id_verification_rejected",
      title: "ID Verification Unsuccessful",
      message: `Your ID verification was not approved: ${reason}. Please resubmit via Settings → Verify Identity.`,
      data: { reason, notes: notes ?? null },
    });
    if (notifErr) console.error("Notification insert error:", notifErr);

    // Send email
    const emailRes = await sendEmail(
      email,
      "Your ID verification was unsuccessful",
      buildHtml(firstName, reason, notes)
    );

    return new Response(JSON.stringify({ success: true, email: emailRes }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-id-rejected error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
