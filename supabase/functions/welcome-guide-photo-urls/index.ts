import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { redact } from "../_shared/safe-log.ts";
import { errorBody, statusFor, type Reason } from "../_shared/http-status.ts";

// Short-lived (5 minute) signed URLs for the photos a SITTER may see right now.
// The allowed list comes from get_sitter_guide, called AS THE SITTER, so the
// same access window applies: no sit or outside the window -> nothing; access
// photos only while arrival details are unlocked. Sitters have no storage
// policy of their own; only this function signs for them.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "welcome-guide-photos";
const EXPIRES_IN_SECONDS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (reason: Reason, error: string, extra: Record<string, unknown> = {}) => json(errorBody(reason, error, extra), statusFor(reason));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", "Method not allowed");

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return fail("auth_missing_token", "Please sign in again.");

  try {
    const body = await req.json().catch(() => ({}));
    const listingId = body?.listing_id;
    if (typeof listingId !== "string" || !UUID_RE.test(listingId)) return fail("bad_input", "Invalid listing.");

    // As the caller: the database decides which photos they may see.
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: guide, error } = await asUser.rpc("get_sitter_guide", { p_listing_id: listingId });
    if (error) {
      console.error(JSON.stringify({ fn: "welcome-guide-photo-urls", rejected: "rpc_failed", detail: redact(error.message) }));
      // Only a rejected token is a sign-in problem; anything else (the guide
      // isn't open to them yet) is a refusal.
      const tokenRejected = error.code === "PGRST301" || error.code === "PGRST303" || /jwt/i.test(error.message);
      return tokenRejected
        ? fail("auth_get_user_failed", "Please sign in again.")
        : fail("not_allowed", "Could not load photos.");
    }
    const allPhotos = ((guide as { photos?: { id: string; storage_path: string }[] } | null)?.photos) ?? [];
    // Defence in depth: only sign files inside this listing's folder,
    // {owner_id}/{listing_id}/{file} (the database enforces this on insert).
    const photos = allPhotos.filter((p) => {
      const parts = typeof p.storage_path === "string" ? p.storage_path.split("/") : [];
      return parts.length === 3 && UUID_RE.test(parts[0]) && parts[1] === listingId && /^[A-Za-z0-9_-]+.(jpg|jpeg|png|webp)$/.test(parts[2]);
    });
    if (photos.length < allPhotos.length) {
      console.error(JSON.stringify({ fn: "welcome-guide-photo-urls", rejected: "path_outside_folder", listing: listingId, count: allPhotos.length - photos.length }));
    }
    if (photos.length === 0) return json({ urls: {} });

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: signed, error: signError } = await service.storage
      .from(BUCKET)
      .createSignedUrls(photos.map((p) => p.storage_path), EXPIRES_IN_SECONDS);
    if (signError) throw signError;

    const byPath = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
    const urls = Object.fromEntries(
      photos.filter((p) => byPath.has(p.storage_path)).map((p) => [p.id, byPath.get(p.storage_path)]),
    );
    return json({ urls, expires_in: EXPIRES_IN_SECONDS });
  } catch (err) {
    console.error("welcome-guide-photo-urls failed:", redact(err));
    return json({ error: "Could not load photos." }, 500);
  }
});
