import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only serve the key to requests carrying this project's own API key
  // (Supabase JS always sends it), so random bots/crawlers cannot harvest it.
  // This function runs with gateway JWT verification on, so any JWT that
  // reaches this code has a valid signature for this project.
  const authHeader = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  const allowed = [
    Deno.env.get("SUPABASE_ANON_KEY"),
    ...(Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")) as string[]),
  ];

  let ok = allowed.includes(token) || allowed.includes(apikey);
  if (!ok) {
    // Legacy JWT API key: valid signature is enforced by the gateway; here we
    // confirm it belongs to this project.
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      ok = payload.ref === Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)\./)?.[1]
        && ["anon", "authenticated", "service_role"].includes(payload.role);
    } catch {
      ok = false;
    }
  }

  if (!ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "Google Maps API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const listingMapId = Deno.env.get("GOOGLE_MAPS_LISTING_MAP_ID") || "";
  const nomadMapId = Deno.env.get("GOOGLE_MAPS_NOMAD_MAP_ID") || "";

  return new Response(JSON.stringify({ key, listingMapId, nomadMapId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
