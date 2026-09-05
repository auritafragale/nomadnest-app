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
  const authHeader = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  const expectedKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!expectedKey || (token !== expectedKey && apikey !== expectedKey)) {
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
