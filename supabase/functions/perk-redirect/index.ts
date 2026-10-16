import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { redact } from "../_shared/safe-log.ts";
import { errorBody, getUserFailureReason, statusFor, type Reason } from "../_shared/http-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (reason: Reason, error: string, extra: Record<string, unknown> = {}) => json(errorBody(reason, error, extra), statusFor(reason));

// Where the click came from (?from= or "from" in the body). Only one of these
// values is stored; nothing else about the page or the sit.
const PLACEMENTS = new Set(["perks_page", "sit_confirmed", "sit_upcoming", "sit_now", "dashboard", "menu"]);
const placementOf = (value: unknown) => (typeof value === "string" && PLACEMENTS.has(value) ? value : "perks_page");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("auth_missing_token", "Unauthorized");

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return fail(getUserFailureReason(authError), "Unauthorized");

    const body = await req.json().catch(() => ({}));
    const slug = body?.slug;
    const placement = placementOf(new URL(req.url).searchParams.get("from") ?? body?.from);
    if (!slug || typeof slug !== "string") return fail("bad_input", "Missing perk");

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

    // The one membership rule (has_side_access), either side.
    const [{ data: nomad }, { data: parent }] = await Promise.all([
      admin.rpc("has_side_access", { p_user_id: user.id, p_side: "sitter" }),
      admin.rpc("has_side_access", { p_user_id: user.id, p_side: "owner" }),
    ]);
    const isMember = profile?.founding_member === true || nomad === true || parent === true;

    if (!isMember) return fail("membership_needed", "Membership required");

    const { data: perk } = await admin
      .from("perks")
      .select("id, affiliate_url, subid_param, is_active, expires_at")
      .eq("slug", slug)
      .maybeSingle();

    if (!perk || !perk.is_active) return fail("not_found", "Perk not found");
    if (perk.expires_at && new Date(perk.expires_at) < new Date(new Date().toDateString())) {
      return json({ error: "Perk expired" }, 410);
    }

    // Log the click with its placement only (never blocks the redirect).
    await admin.from("perk_clicks").insert({ perk_id: perk.id, user_id: user.id, placement });

    // Append sub-id so partner dashboards can be matched back to members
    let url = perk.affiliate_url as string;
    if (perk.subid_param) {
      const subid = await hashSubId(user.id);
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}${encodeURIComponent(perk.subid_param)}=${subid}`;
    }

    return json({ url });
  } catch (e) {
    console.error("perk-redirect error", redact(e));
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
