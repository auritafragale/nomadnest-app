import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { providerError, redact } from "../_shared/safe-log.ts";
import { errorBody, getUserFailureReason, statusFor, type Reason } from "../_shared/http-status.ts";
import { PHONE_MESSAGES, phoneHash, toE164 } from "../_shared/phone-rules.ts";

// Checks a verification code. Only for the number this member last started
// with (verify-phone-start), within the same limits (3 checks in 10 minutes,
// 10 a day), and never for a number verified on another account. Plain
// messages only; logs never hold the number.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (reason: Reason, message: string, status?: number) => json(errorBody(reason, message), status ?? statusFor(reason));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return fail("auth_missing_token", "Please sign in again.");

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authError || !user) {
    const reason = getUserFailureReason(authError);
    return fail(reason, "Please sign in again.");
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const serviceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
  if (!accountSid || !authToken || !serviceSid || !serviceKey) {
    console.error("verify-phone-check: not configured");
    return fail("provider_failed", PHONE_MESSAGES.notReady);
  }

  const body = (await req.json().catch(() => ({}))) as { phone_number?: unknown; code?: unknown };
  const phone = toE164(body.phone_number);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!phone || !/^\d{4,10}$/.test(code)) return fail("bad_input", PHONE_MESSAGES.missing);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const hash = await phoneHash(phone, serviceKey);

    // Only the number this member last requested a code for.
    const { data: matches, error: matchError } = await admin.rpc("phone_send_matches", { p_user_id: user.id, p_phone_hash: hash });
    if (matchError) throw matchError;
    if (!matches) return fail("bad_input", PHONE_MESSAGES.wrongNumber);

    // The same limits as sending, for checks.
    const { data: allowed, error: limitError } = await admin.rpc("record_phone_verify_attempt", {
      p_user_id: user.id,
      p_phone_hash: hash,
      p_channel: "check",
    });
    if (limitError) throw limitError;
    if (allowed !== "ok") {
      console.log(JSON.stringify({ fn: "verify-phone-check", user: user.id, outcome: "too_many" }));
      return fail("rate_limited", PHONE_MESSAGES.tooMany);
    }

    const basicAuth = btoa(`${accountSid}:${authToken}`);
    const checkRes = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`, {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, Code: code }).toString(),
    });
    const checkText = await checkRes.text();
    let status: string | null = null;
    try {
      status = JSON.parse(checkText)?.status ?? null;
    } catch {
      status = null;
    }
    if (!checkRes.ok || status !== "approved") {
      if (!checkRes.ok) console.error("Twilio VerificationCheck:", providerError(checkRes.status, checkText), "user", user.id);
      return checkRes.status >= 500 ? fail("provider_failed", PHONE_MESSAGES.notReady) : fail("bad_input", PHONE_MESSAGES.badCode);
    }

    // Verified on another account in the meantime: neutral, nothing saved.
    const { data: taken, error: takenError } = await admin.rpc("phone_number_taken", { p_user_id: user.id, p_phone_number: phone });
    if (takenError) throw takenError;
    if (taken) return fail("bad_input", PHONE_MESSAGES.unavailable);

    const { error: updateError } = await admin
      .from("profiles")
      .update({ phone_number: phone, phone_verified: true, phone_verified_at: new Date().toISOString() })
      .eq("id", user.id);
    if (updateError) {
      console.error("verify-phone-check: saving failed", redact(updateError));
      return fail("provider_failed", "We couldn't save your number. Please try again.", 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("verify-phone-check failed:", redact(err));
    return fail("provider_failed", PHONE_MESSAGES.notReady);
  }
});
