import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { redact } from "../_shared/safe-log.ts";
import { plainSubject } from "../_shared/escape.ts";

// The founders' email about a new report. Since Batch F1 it is sent by the
// database (the notify_new_report trigger, with the Vault secret), so a
// report is never missed when the reporter's app closes. A call made with a
// member's sign-in (older app versions) gets a quiet 200 { skipped: true }.
// The email never includes the report's details text: the team reads it in
// Admin, Reports.

const safeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Only the report id is taken from the request; everything else is read
 * from the database. */
interface Payload {
  reportId?: string;
}

interface ReportRow {
  id: string;
  reporter_user_id: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  evidence_paths: string[] | null;
  created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escape untrusted report text before interpolating into HTML. */
const AMP = String.fromCharCode(38) + "amp;"; // &
const LT = String.fromCharCode(38) + "lt;"; // <
const GT = String.fromCharCode(38) + "gt;"; // >
const QUOT = String.fromCharCode(38) + "quot;"; // "
const APOS = String.fromCharCode(38) + "#039;"; // '
const esc = (s: string | null | undefined): string =>
  (s ?? "")
    .replace(/&/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)
    .replace(/"/g, QUOT)
    .replace(/'/g, APOS);

const buildHtml = (
  p: { targetType: string; reason: string; hasDetails: boolean },
  reporter: string,
  reportedName: string,
  reportedEmail: string,
  reportedProfileUrl: string,
  evidenceCount: number,
) => {
  const reportedLine = reportedName
    ? `<p><strong>Reported member:</strong> <a href="${esc(reportedProfileUrl)}" style="color:#E8735A;">${esc(reportedName)}</a>${reportedEmail ? ` (${esc(reportedEmail)})` : ""}</p>`
    : `<p><strong>What was reported:</strong> ${esc(p.targetType)}</p>`;

  // No file links in email: admins view proof in the admin panel.
  const evidenceLine =
    evidenceCount > 0
      ? `<p><strong>Proof attached:</strong> ${evidenceCount} file${evidenceCount === 1 ? "" : "s"}. View ${evidenceCount === 1 ? "it" : "them"} in Admin → Reports.</p>`
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
      ${p.hasDetails ? `<p>The member added details. Read them in Admin → Reports.</p>` : ""}
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

    // The database only (x-internal-secret). Older app versions call this
    // with a member's sign-in: send nothing, report nothing wrong.
    const expected = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
    const provided = req.headers.get("x-internal-secret") ?? "";
    if (!expected || !safeEqual(provided, expected)) {
      console.log(JSON.stringify({ fn: "notify-new-report", skipped: "not_internal" }));
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Payload;
    if (typeof body.reportId !== "string" || !UUID_RE.test(body.reportId)) {
      return new Response(JSON.stringify({ error: "Invalid report.", reason: "bad_input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: report } = await supabase
      .from("reports")
      .select("id, reporter_user_id, target_type, target_id, reason, details, evidence_paths, created_at")
      .eq("id", body.reportId)
      .maybeSingle();
    const row = report as ReportRow | null;
    if (!row) {
      console.error(JSON.stringify({ fn: "notify-new-report", rejected: "report_not_found" }));
      return new Response(JSON.stringify({ error: "Report not found.", reason: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const payload = {
      targetType: row.target_type,
      targetId: row.target_id,
      reason: row.reason,
      hasDetails: !!row.details?.trim(),
    };
    const evidenceCount = (row.evidence_paths ?? []).length;

    const { data: reporterProfile } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", row.reporter_user_id ?? "")
      .maybeSingle();

    const reporter = [reporterProfile?.first_name, reporterProfile?.last_name]
      .filter(Boolean)
      .join(" ") || reporterProfile?.email || "A member";

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
        subject: plainSubject(`New safety report: ${payload.reason}`),
        html: buildHtml(payload, reporter, reportedName, reportedEmail, reportedProfileUrl, evidenceCount),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend failed", redact(err));
    }

    return new Response(JSON.stringify({ sent: recipients.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-new-report failed", redact(e));
    return new Response(JSON.stringify({ error: "failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
