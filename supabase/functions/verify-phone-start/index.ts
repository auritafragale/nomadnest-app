import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const accountSid  = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken   = Deno.env.get("TWILIO_AUTH_TOKEN");
  const serviceSid  = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

  if (!accountSid || !authToken || !serviceSid) {
    return new Response(JSON.stringify({ error: "Twilio credentials not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { phone_number, channel } = await req.json() as {
    phone_number: string;
    channel: "sms" | "whatsapp";
  };

  if (!phone_number) {
    return new Response(JSON.stringify({ error: "phone_number is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Normalise channel: only allow whatsapp if the env flag is set.
  const enableWhatsApp = Deno.env.get("ENABLE_WHATSAPP_VERIFY") === "true";
  const resolvedChannel = (channel === "whatsapp" && enableWhatsApp) ? "whatsapp" : "sms";

  const basicAuth = btoa(`${accountSid}:${authToken}`);

  // ── Part 4: Twilio Lookup (line_type_intelligence) ───────────────────────
  // Non-blocking: if Lookup fails we still proceed with verification.
  let lineType: string | null = null;
  let isVoip = false;

  try {
    const lookupRes = await fetch(
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone_number)}?Fields=line_type_intelligence`,
      { headers: { Authorization: `Basic ${basicAuth}` } }
    );

    if (lookupRes.ok) {
      const lookupData = await lookupRes.json();
      lineType = lookupData?.line_type_intelligence?.type ?? null;
      isVoip = lineType === "voip" || lineType === "nonFixedVoip";

      // Persist the line type so it is available for manual review later.
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );
      await adminClient
        .from("profiles")
        .update({ phone_line_type: lineType })
        .eq("id", user.id);
    }
  } catch (err) {
    console.error("Twilio Lookup error (non-fatal):", err);
  }

  // ── Start Twilio Verify ───────────────────────────────────────────────────
  const verifyUrl = `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`;

  const body = new URLSearchParams({
    To: phone_number,
    Channel: resolvedChannel,
  });

  const verifyRes = await fetch(verifyUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json();
    return new Response(JSON.stringify({ error: err.message || "Failed to send verification code" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    channel: resolvedChannel,
    // Inform the client if a VOIP warning should be shown. We do NOT block.
    voip_warning: isVoip,
    line_type: lineType,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
