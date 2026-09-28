import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { redact } from "../_shared/safe-log.ts";

// Public read of a shared Sit Story (the /s/:token page). Signed-out visitors
// have no database access; this function is the only way in.
//
// - Rate limits: per link in the database (60 views a minute, no IP or user
//   stored), and per visitor IP in this function's memory only (30 a minute).
//   The IP is hashed in memory, never logged and never stored.
// - Returns city, first names (the Nomad's only if they allow it), the story
//   and the photos the Pet Parent approved for the Nomad's profile, as
//   5-minute links. Nothing links to anyone's profile.
// - Logs: outcome and counts only, never the token or the IP.

const BUCKET = "sit-update-photos";
const EXPIRES_IN_SECONDS = 300;
const PER_IP_PER_MINUTE = 30;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const PHOTO_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
const log = (entry: Record<string, unknown>) => console.log(JSON.stringify({ fn: "shared-story", ...entry }));

// Per-IP counters for this instance (hash → count this minute).
const ipCounts = new Map<string, { minute: number; count: number }>();
const ipAllowed = async (req: Request) => {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const key = Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  const minute = Math.floor(Date.now() / 60_000);
  const entry = ipCounts.get(key);
  if (!entry || entry.minute !== minute) {
    ipCounts.set(key, { minute, count: 1 });
    if (ipCounts.size > 5000) {
      for (const [k, v] of ipCounts) if (v.minute !== minute) ipCounts.delete(k);
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= PER_IP_PER_MINUTE;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";
    if (!TOKEN_RE.test(token)) return json({ error: "This story isn't available." }, 404);

    if (!(await ipAllowed(req))) {
      log({ rejected: "ip_rate" });
      return json({ error: "Too many requests. Please try again in a minute." }, 429);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    const { data: allowed, error: hitError } = await admin.rpc("hit_shared_sit_story", { p_token: token });
    if (hitError) throw hitError;
    if (!allowed) {
      // Unknown, switched off, or over this link's limit: same answer.
      log({ rejected: "link_unavailable_or_rate" });
      return json({ error: "This story isn't available." }, 404);
    }

    const { data: story, error } = await admin.rpc("get_shared_sit_story", { p_token: token });
    if (error) throw error;
    if (!story) return json({ error: "This story isn't available." }, 404);

    const s = story as {
      title: string | null;
      story: string | null;
      story_days: { date: string; text: string }[] | null;
      city: string | null;
      month: string | null;
      owner_first_name: string;
      sitter_name: string | null;
      photo_paths: string[];
    };
    const paths = (s.photo_paths ?? []).filter((p) => typeof p === "string" && PHOTO_RE.test(p));
    let photos: string[] = [];
    if (paths.length > 0) {
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrls(paths, EXPIRES_IN_SECONDS);
      photos = (signed ?? []).map((x) => x.signedUrl).filter((u): u is string => !!u);
    }

    log({ ok: true, photos: photos.length });
    return json({
      title: s.title,
      story: s.story,
      story_days: s.story_days,
      city: s.city,
      month: s.month,
      owner_first_name: s.owner_first_name,
      sitter_name: s.sitter_name,
      photos,
    });
  } catch (err) {
    console.error("shared-story failed", redact(err));
    return json({ error: "This story couldn't be loaded." }, 500);
  }
});
