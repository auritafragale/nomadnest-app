import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

serve(async (req) => {
  try {
    const rawBody = await req.text();

    // Verify HMAC-SHA256 signature
    const signature = req.headers.get("X-SHA2-Signature");
    const webhookToken = Deno.env.get("ONFIDO_WEBHOOK_TOKEN");

    // Signature verification is mandatory — an unsigned or unconfigured
    // request must never be able to mark a member as ID verified.
    if (!webhookToken) {
      console.error("ONFIDO_WEBHOOK_TOKEN is not configured");
      return new Response("Webhook not configured", { status: 500 });
    }
    if (!signature) {
      return new Response("Missing signature", { status: 401 });
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookToken),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const computed = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computed !== signature) {
      return new Response("Invalid signature", { status: 401 });
    }


    const payload = JSON.parse(rawBody);
    const { resource_type, action, object } = payload;

    // Only handle completed checks
    if (resource_type !== "check" || action !== "check.completed") {
      return new Response("ok", { status: 200 });
    }

    const checkId = object?.id;
    const checkResult = object?.result; // "clear", "consider", "unidentified"

    if (!checkId) {
      return new Response("Missing check ID", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find profile by check ID
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("onfido_check_id", checkId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Profile not found for check:", checkId);
      return new Response("Profile not found", { status: 404 });
    }

    const verified = checkResult === "clear";

    // Update profiles table
    await supabase
      .from("profiles")
      .update({ id_verified: verified })
      .eq("id", profile.id);

    // Sync to sitter_profiles if exists
    await supabase
      .from("sitter_profiles")
      .update({ id_verified: verified })
      .eq("user_id", profile.id);

    return new Response("ok", { status: 200 });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
