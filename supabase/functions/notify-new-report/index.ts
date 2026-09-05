import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  targetType: string;
  targetId: string;
  reason: string;
  details?: string;
  evidencePaths?: string[];
  reportId?: string;
}

/** Escape untrusted report text before interpolating into HTML. */
const esc = (s: string | null | undefined): string =>
  (s ?? "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """)
    .replace(/'/g, "&#039;");

const buildHtml = (
  p: Payload,
  reporter: string,
  reportedName: string,
  reportedEmail: string,
  reportedProfileUrl: string,
  evidenceUrls: string[],
) => {
  const reportedLine = reportedName
    ? `<p><strong>Reported member:</strong> <a href="${esc(reportedProfileUrl)}" style="color:#E8735A;">${esc(reportedName)}</a>${reportedEmail ? ` (${esc(reportedEmail)})` : ""}</p>`
    : `<p><strong>What was reported:</strong> ${esc(p.targetType)}</p>`;

  const evidenceLine =
    evidenceUrls.length > 0
      ? `<p><strong>Proof attached:</strong><br/>${evidenceUrls
          .map((u) => `<a href="${esc(u)}" style="color:#E8735A;">View file</a>`)
          .join("<br/>")}</p>`
      : "";

  return `
  <!DOCTYPE html>
  <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="text-align:center;margin-bottom:24px;">
        <img src="https://nomadnest.global/logo-email.png" alt="NomadNest" style="max-width:160px;" />
      </div>
      <h2 style="color:#1A1A1A;">New safety report</h2>
      <p><strong>Reported by:</strong> ${esc(reporter)}</p>
      ${reportedLine}
      <p><strong>Reason:</strong> ${esc(p.reason)}</p>
      ${p.details ? `<blockquote style="border-left:3px solid #E8735A;padding-left:12px;color:#555;">${esc(p.details)}</blockquote>` : ""}
      ${evidenceLine}
      <p><a href="https://nomadnest.global/admin/reports" style="display:inline-block;background:#E8735A;color:#fff;padding:10px 18px;border-radius:14px;text-decoration:none;">Review in admin panel</a></p>
    </body>
  </html>`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Only a signed-in member can trigger this
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const { data: caller, error: callerErr } = await supabase.auth.getUser(jwt);
    if (callerErr || !caller?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;

    const { data: reporterProfile } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", caller.user.id)
      .maybeSingle();

    const reporter = [reporterProfile?.first_name, reporterProfile?.last_name]
      .filter(Boolean)
      .join(" ") || reporterProfile?.email || caller.user.id;

    // Resolve the reported member's name + email for the founder email
    let reportedName = "";
    let reportedEmail = "";
    let reportedProfileUrl = "";
    if (payload.targetType === "user" || payload.targetType === "message") {
      const { data: target } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, full_name")
        .eq("id", payload.targetId)
        .maybeSingle();
      if (target) {
        reportedName =
          target.full_name ||
          [target.first_name, target.last_name].filter(Boolean).join(" ") ||
          target.email ||
          "";
        reportedEmail = target.email || "";
        reportedProfileUrl = `https://nomadnest.global/sitter/${target.id}`;
      }
    } else if (payload.targetType === "listing") {
      const { data: listing } = await supabase
        .from("listings")
        .select("title, owner_user_id")
        .eq("id", payload.targetId)
        .maybeSingle();
      if (listing) {
        reportedName = listing.title || "Listing";
        reportedProfileUrl = `https://nomadnest.global/listing/${payload.targetId}`;
        const { data: owner } = await supabase
          .from("profiles")
          .select("email, first_name, last_name, full_name")
          .eq("id", listing.owner_user_id)
          .maybeSingle();
        if (owner) {
          reportedEmail = owner.email || "";
          reportedName = `${listing.title} — owner: ${
            owner.full_name ||
            [owner.first_name, owner.last_name].filter(Boolean).join(" ") ||
            owner.email ||
            ""
          }`;
          reportedProfileUrl = `https://nomadnest.global/owner/${listing.owner_user_id}`;
        }
      }
    }

    // Create signed URLs for any evidence files (5-minute expiry)
    const evidenceUrls: string[] = [];
    for (const path of payload.evidencePaths ?? []) {
      const { data } = await supabase.storage
        .from("report-evidence")
        .createSignedUrl(path, 300);
      if (data?.signedUrl) evidenceUrls.push(data.signedUrl);
    }

    const { data: admins } = await supabase
      .from("profiles")
      .select("email")
      .eq("is_admin", true);

    const recipients = (admins || []).map((a) => a.email).filter(Boolean);
    if (recipients.length === 0 || !RESEND_API_KEY) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NomadNest <noreply@nomadnest.global>",
        to: recipients,
        subject: `New safety report: ${payload.reason}`,
        html: buildHtml(payload, reporter, reportedName, reportedEmail, reportedProfileUrl, evidenceUrls),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend failed", err);
    }

    return new Response(JSON.stringify({ sent: recipients.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-new-report failed", e);
    return new Response(JSON.stringify({ error: "failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
