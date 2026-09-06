import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // The gateway verifies the JWT / project API key before this code runs
  // (verify_jwt = true in config.toml), so any request that reaches here
  // already carries valid credentials for this project.
  const hasCredentials =
    !!req.headers.get("Authorization") || !!req.headers.get("apikey");

  if (!hasCredentials) {
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
