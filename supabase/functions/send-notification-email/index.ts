import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import {
  renderBrandedEmail,
  sendBrandedEmail,
} from "../_shared/branded-email.ts";
import { buildNotificationEmail } from "../_shared/email-templates.ts";
import { redact } from "../_shared/safe-log.ts";

// Creates the in-app notification row (unless skipInAppNotification) and sends
// the email. The push is sent by the AFTER INSERT trigger on notifications.
//
// CALLERS
// * Internal only (service-role key, or x-internal-secret =
//   INTERNAL_TRIGGER_SECRET, used by database triggers via Vault and by cron
//   edge functions): any type, data trusted.
// * Members (their own JWT): since Batch F1 every notification is sent by the
//   server, so a call made with a member's sign-in (older app versions still
//   open on phones) gets a quiet 200 { skipped: true } and nothing is sent.
//
// Every rejection logs one JSON line with the reason, never silently.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const log = (entry: Record<string, unknown>) =>
  console.log(JSON.stringify({ fn: "send-notification-email", ...entry }));

/** Logs why a request was refused, then returns the response. */
const reject = (
  reason: string,
  status: number,
  context: Record<string, unknown> = {},
  publicMessage = "Notification not sent",
) => {
  log({ rejected: reason, status, ...context });
  return json({ error: publicMessage, reason }, status);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const safeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

/** Only in-app relative paths ("/..."), never "//host" or "@host" tricks. */
// Also no quotes, angle brackets, backslashes or whitespace: the path ends up
// inside an href="..." in the email.
const SAFE_PATH_RE = /^\/(?!\/)[^\s"'<>\\]*$/;
const safePath = (url: unknown): string | undefined =>
  typeof url === "string" && url.length <= 500 && SAFE_PATH_RE.test(url) ? url : undefined;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return reject("method_not_allowed", 405, { method: req.method });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ── Who is calling? ──
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let isInternalCaller = serviceKey.length > 0 && jwt.length > 0 && safeEqual(jwt, serviceKey);

    const internalSecretHeader = req.headers.get("x-internal-secret");
    if (!isInternalCaller && internalSecretHeader !== null) {
      const expected = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
      if (!expected || !safeEqual(internalSecretHeader, expected)) {
        return reject("internal_secret_mismatch", 401);
      }
      isInternalCaller = true;
    }

    // Every notification is sent by the server now (Batch F1). Older app
    // versions still call this with a member's sign-in: say nothing went
    // wrong, send nothing, so they can't create doubles or fake notices.
    if (!isInternalCaller) {
      log({ skipped: "member_call" });
      return json({ skipped: true });
    }

    // ── What are they asking for? ──
    let payload: { type?: unknown; recipientUserId?: unknown; data?: unknown; skipInAppNotification?: unknown };
    try {
      payload = await req.json();
    } catch {
      return reject("bad_json", 400);
    }
    const type = typeof payload.type === "string" ? payload.type : "";
    const recipientUserId = payload.recipientUserId;
    const skipInAppNotification = payload.skipInAppNotification === true;
    if (!type) return reject("missing_type", 400);
    if (!isUuid(recipientUserId)) return reject("bad_recipient", 400, { type });

    // Keep only string values, bounded.
    const rawData: Record<string, string> = {};
    if (payload.data && typeof payload.data === "object") {
      for (const [k, v] of Object.entries(payload.data as Record<string, unknown>)) {
        if (typeof v === "string") rawData[k] = v.slice(0, 2000);
        else if (typeof v === "number" || typeof v === "boolean") rawData[k] = String(v);
      }
    }
    const url = safePath(rawData.url);
    if (url) rawData.url = url;
    else delete rawData.url;

    const data = rawData;

    console.log(`Processing ${type} notification for user ${recipientUserId}`);

    // Get user email and check notification preferences
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("email, first_name")
      .eq("id", recipientUserId)
      .single();

    if (profileError || !profile?.email) {
      return reject("recipient_email_not_found", 404, {
        type, recipient: recipientUserId, detail: profileError?.message ?? null,
      });
    }

    // The member's email choice for this kind of notification. One rule in
    // the database (notification_allowed): always-on types (safety, ID checks,
    // payment problems, changes to sits) always send.
    const { data: emailAllowed, error: allowedError } = await supabaseClient.rpc("notification_allowed", {
      p_user_id: recipientUserId,
      p_type: type,
      p_channel: "email",
    });
    if (allowedError) console.error("notification_allowed failed:", redact(allowedError));

    // Plain text for the in-app row (and so the push); HTML-escaped copy for
    // the email, so text people wrote can't inject markup into it.
    const plainContent = buildNotificationEmail(type, data);
    const escapedData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, escapeHtml(v)]));
    if (data.url) escapedData.url = data.url; // already a safe relative path
    const emailContent = buildNotificationEmail(type, escapedData);

    // Write the in-app notification first: the bell/notification list reads this
    // table, and clients are not allowed to insert rows for other members.
    // Skipped when the row was already created elsewhere (e.g. a DB trigger).
    if (!skipInAppNotification) {
      const { error: notifError } = await supabaseClient.from("notifications").insert({
        user_id: recipientUserId,
        type,
        title: plainContent.pushTitle ?? plainContent.subject,
        message: plainContent.pushBody ?? "",
        data: { ...data, url: plainContent.pushUrl },
      });
      if (notifError) {
        console.error("Could not create in-app notification:", redact(notifError));
      }
    }

    // Push is NOT sent here: every in-app notifications row triggers exactly one
    // push via the AFTER INSERT trigger on public.notifications.

    if (emailAllowed === false) {
      log({ skipped_email: "preference_off", type, recipient: recipientUserId });
      return json({ message: "Email notifications disabled" });
    }

    const fullHtml = renderBrandedEmail(emailContent, {
      preview: emailContent.preview,
    });

    const emailResponse = await sendBrandedEmail(profile.email, emailContent.subject, fullHtml);

    console.log("Email sent successfully:", redact(emailResponse));

    return json(emailResponse as Record<string, unknown>);
  } catch (error) {
    console.error("Error in send-notification-email function:", redact(error));
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
};

serve(handler);
