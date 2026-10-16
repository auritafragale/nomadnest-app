import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { providerError, redact } from "../_shared/safe-log.ts";
import { errorBody, getUserFailureReason, statusFor, type Reason } from "../_shared/http-status.ts";
import { PHONE_MESSAGES, phoneHash, toE164 } from "../_shared/phone-rules.ts";

// Sends a verification code (Twilio Verify) to the signed-in member's number.
// Before anything goes to Twilio, the database checks the member's limits
// (3 sends in 10 minutes, 10 a day, 3 different numbers a day) and records
// the attempt with a keyed hash of the number, never the number. A number
// verified on another account is refused with a neutral message. The paid
// Twilio Lookup runs once per member and number. Members only ever see plain
// messages; logs never hold the number.

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
    console.error("verify-phone-start: not configured");
    return fail("provider_failed", PHONE_MESSAGES.notReady);
  }

  const body = (await req.json().catch(() => ({}))) as { phone_number?: unknown; channel?: unknown };
  const phone = toE164(body.phone_number);
  if (!phone) return fail("bad_input", PHONE_MESSAGES.badNumber);

  // WhatsApp only when it's switched on.
  const enableWhatsApp = Deno.env.get("ENABLE_WHATSAPP_VERIFY") === "true";
  const requestedChannel: "sms" | "whatsapp" = body.channel === "whatsapp" && enableWhatsApp ? "whatsapp" : "sms";

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    // Already verified on another account: neutral, nothing sent.
    const { data: taken, error: takenError } = await admin.rpc("phone_number_taken", { p_user_id: user.id, p_phone_number: phone });
    if (takenError) throw takenError;
    if (taken) {
      console.log(JSON.stringify({ fn: "verify-phone-start", user: user.id, outcome: "unavailable" }));
      return fail("bad_input", PHONE_MESSAGES.unavailable);
    }

    // Limits, checked and recorded in one step before Twilio is called.
    const hash = await phoneHash(phone, serviceKey);
    const { data: allowed, error: limitError } = await admin.rpc("record_phone_verify_attempt", {
      p_user_id: user.id,
      p_phone_hash: hash,
      p_channel: requestedChannel,
    });
    if (limitError) throw limitError;
    if (allowed !== "ok") {
      console.log(JSON.stringify({ fn: "verify-phone-start", user: user.id, outcome: "too_many" }));
      return fail("rate_limited", PHONE_MESSAGES.tooMany);
    }

    const basicAuth = btoa(`${accountSid}:${authToken}`);

    // Twilio Lookup (line type), once per member and number. Not blocking.
    let lineType: string | null = null;
    const { data: lookupNeeded } = await admin.rpc("phone_lookup_needed", { p_user_id: user.id, p_phone_hash: hash });
    if (lookupNeeded) {
      try {
        const lookupRes = await fetch(
          `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}?Fields=line_type_intelligence`,
          { headers: { Authorization: `Basic ${basicAuth}` } },
        );
        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          lineType = lookupData?.line_type_intelligence?.type ?? null;
          await admin.from("profiles").update({ phone_line_type: lineType }).eq("id", user.id);
        } else {
          console.error("Twilio Lookup:", providerError(lookupRes.status, await lookupRes.text()));
        }
      } catch (err) {
        console.error("Twilio Lookup (not blocking):", redact(err));
      }
    } else {
      const { data: me } = await admin.from("profiles").select("phone_line_type").eq("id", user.id).maybeSingle();
      lineType = (me?.phone_line_type as string | null) ?? null;
    }
    const isVoip = lineType === "voip" || lineType === "nonFixedVoip";

    // Twilio Verify, with WhatsApp falling back to SMS (one attempt counted).
    const startVerification = (verifyChannel: "sms" | "whatsapp") =>
      fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`, {
        method: "POST",
        headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: phone, Channel: verifyChannel }).toString(),
      });

    let verifyRes = await startVerification(requestedChannel);
    let deliveredChannel: "sms" | "whatsapp" = requestedChannel;
    if (requestedChannel === "whatsapp" && !verifyRes.ok) {
      verifyRes = await startVerification("sms");
      deliveredChannel = "sms";
    }
    if (!verifyRes.ok) {
      console.error("Twilio Verify:", providerError(verifyRes.status, await verifyRes.text()), "user", user.id);
      return verifyRes.status >= 500 ? fail("provider_failed", PHONE_MESSAGES.sendFailed) : fail("bad_input", PHONE_MESSAGES.sendFailed);
    }

    return json({
      success: true,
      channel: deliveredChannel,
      delivered_channel: deliveredChannel,
      // A VOIP warning is shown; nothing is blocked.
      voip_warning: isVoip,
      line_type: lineType,
    });
  } catch (err) {
    console.error("verify-phone-start failed:", redact(err));
    return fail("provider_failed", PHONE_MESSAGES.notReady);
  }
});
