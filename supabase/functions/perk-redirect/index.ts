import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { slug, referrer } = await req.json().catch(() => ({ slug: null, referrer: null }));
    if (!slug || typeof slug !== "string") return json({ error: "Missing perk" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Membership gate
    const { data: profile } = await admin
      .from("profiles")
      .select("founding_member, membership_status, membership_expiry")
      .eq("id", user.id)
      .maybeSingle();

    const isMember =
      profile?.founding_member === true ||
      (profile?.membership_status === "active" &&
        (!profile?.membership_expiry || new Date(profile.membership_expiry) > new Date()));

    if (!isMember) return json({ error: "Membership required" }, 403);

    const { data: perk } = await admin
      .from("perks")
      .select("id, affiliate_url, subid_param, is_active, expires_at")
      .eq("slug", slug)
      .maybeSingle();

    if (!perk || !perk.is_active) return json({ error: "Perk not found" }, 404);
    if (perk.expires_at && new Date(perk.expires_at) < new Date(new Date().toDateString())) {
      return json({ error: "Perk expired" }, 410);
    }

    // Log the click (never blocks the redirect)
    await admin
      .from("perk_clicks")
      .insert({ perk_id: perk.id, user_id: user.id, referrer: referrer ?? null });

    // Append sub-id so partner dashboards can be matched back to members
    let url = perk.affiliate_url as string;
    if (perk.subid_param) {
      const subid = await hashSubId(user.id);
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}${encodeURIComponent(perk.subid_param)}=${subid}`;
    }

    return json({ url });
  } catch (e) {
    console.error("perk-redirect error", e);
    return json({ error: "Unexpected error" }, 500);
  }
});

async function hashSubId(userId: string) {
  const bytes = new TextEncoder().encode(`nomadnest:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
