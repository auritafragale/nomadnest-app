import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import {
  renderBrandedEmail,
  sendBrandedEmail,
} from "../_shared/branded-email.ts";
import {
  buildContactConfirmationEmail,
  buildContactNotificationEmail,
} from "../_shared/email-templates.ts";
import { maskEmail, redact } from "../_shared/safe-log.ts";

// Public contact form. Anyone can call it, so:
//  1. Cloudflare Turnstile token verified server-side (TURNSTILE_SECRET_KEY);
//     no secret or a failed check = refused.
//  2. Rate limits: 5 per hour per IP, 3 per 24 hours per email address.
//     Only keyed hashes (HMAC-SHA256) of the IP and email are stored, and rows
//     older than 2 days are deleted on every call.
//  3. Input checked (fixed categories, lengths, email format).
//  4. Support gets the message (every field HTML-escaped). The sender gets a
//     confirmation with NO text they typed, so the form can't be used to send
//     someone else an email with arbitrary content from our domain.
// Logs: masked email, category and outcome only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const categoryLabels: Record<string, string> = {
  general: "General Question",
  account: "Account Help",
  safety: "Safety Concern",
  bug: "Bug Report",
  feedback: "Feedback & Suggestions",
  partnership: "Partnership Inquiry",
};

const PER_IP_PER_HOUR = 5;
const PER_EMAIL_PER_DAY = 3;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify({ fn: "send-contact-email", ...entry }));

const hmac = async (key: string, value: string) => {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const clientIp = (req: Request) =>
  req.headers.get("cf-connecting-ip") ??
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  req.headers.get("x-real-ip") ??
  "unknown";

const verifyTurnstile = async (secret: string, token: string, ip: string) => {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip !== "unknown") form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  if (!res.ok) return { ok: false, codes: [`http_${res.status}`] };
  const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
  return { ok: data.success === true, codes: data["error-codes"] ?? [] };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
  if (!secret) {
    log({ rejected: "turnstile_not_configured" });
    return json({ error: "The contact form is temporarily unavailable. Please email support@nomadnest.global." }, 503);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const category = typeof body.category === "string" ? body.category : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";

    if (!name || name.length > 100 || !EMAIL_RE.test(email) || email.length > 254 || !(category in categoryLabels)
        || !subject || subject.length > 200 || message.length < 10 || message.length > 2000) {
      log({ rejected: "invalid_input" });
      return json({ error: "Please check the form and try again." }, 400);
    }

    // 1) Turnstile
    const ip = clientIp(req);
    if (!token) {
      log({ rejected: "turnstile_missing" });
      return json({ error: "Please complete the security check." }, 400);
    }
    const check = await verifyTurnstile(secret, token, ip);
    if (!check.ok) {
      log({ rejected: "turnstile_failed", codes: check.codes.join(",") });
      return json({ error: "The security check didn't pass. Please try again." }, 403);
    }

    // 2) Rate limits (keyed hashes only)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const [ipHash, emailHash] = await Promise.all([hmac(secret, `ip:${ip}`), hmac(secret, `email:${email}`)]);
    await admin.from("contact_rate_limits").delete().lt("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString());
    const [{ count: ipCount }, { count: emailCount }] = await Promise.all([
      admin.from("contact_rate_limits").select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash).gte("created_at", new Date(Date.now() - 3_600_000).toISOString()),
      admin.from("contact_rate_limits").select("id", { count: "exact", head: true })
        .eq("email_hash", emailHash).gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    ]);
    if ((ipCount ?? 0) >= PER_IP_PER_HOUR || (emailCount ?? 0) >= PER_EMAIL_PER_DAY) {
      log({ rejected: "rate_limited", by: (ipCount ?? 0) >= PER_IP_PER_HOUR ? "ip" : "email" });
      return json({ error: "You've sent a few messages already. Please try again later, or email support@nomadnest.global." }, 429);
    }
    const { error: insertError } = await admin.from("contact_rate_limits").insert({ ip_hash: ipHash, email_hash: emailHash });
    if (insertError) throw new Error(`rate limit insert failed: ${insertError.message}`);

    // 3) Emails
    const categoryLabel = categoryLabels[category];
    const notification = buildContactNotificationEmail({ name, email, categoryLabel, subject, message });
    await sendBrandedEmail(
      "support@nomadnest.global",
      notification.subject,
      renderBrandedEmail(notification, { footerReason: notification.footerReason }),
    );

    const confirmation = buildContactConfirmationEmail({ categoryLabel });
    await sendBrandedEmail(
      email,
      confirmation.subject,
      renderBrandedEmail(confirmation, { preview: confirmation.preview, footerReason: confirmation.footerReason }),
    );

    log({ ok: true, category, email: maskEmail(email) });
    return json({ success: true });
  } catch (err) {
    log({ failed: redact(err) });
    return json({ error: "We couldn't send your message just now. Please try again, or email support@nomadnest.global." }, 500);
  }
};

serve(handler);
