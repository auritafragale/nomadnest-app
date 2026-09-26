import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import tzlookup from "npm:@photostructure/tz-lookup@11.7.0";

// Sets listings.timezone from the home's coordinates, using an offline
// lookup (@photostructure/tz-lookup, ~88 KB, no paid API).
// Internal callers only (x-internal-secret from Vault):
//   { listing_id }  one listing (the listings trigger, on create or when the
//                   coordinates change)
//   { backfill: true }  every listing with coordinates (run once)
// Listings without coordinates are left alone (browser time zone at creation,
// then UTC in the access-window functions).

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const log = (entry: Record<string, unknown>) =>
  console.log(JSON.stringify({ fn: "listing-timezone", ...entry }));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const safeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

const lookup = (lat: unknown, lng: unknown): string | null => {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  try {
    return tzlookup(la, lo) || null;
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (!expected || !safeEqual(provided, expected)) {
    log({ rejected: "internal_secret_mismatch" });
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({}));

    let query = supabase
      .from("listings")
      .select("id, latitude, longitude, timezone")
      .not("latitude", "is", null)
      .not("longitude", "is", null);
    if (body?.backfill === true) {
      // all listings with coordinates
    } else if (typeof body?.listing_id === "string" && UUID_RE.test(body.listing_id)) {
      query = query.eq("id", body.listing_id);
    } else {
      return json({ error: "Invalid request" }, 400);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    let updated = 0;
    let skipped = 0;
    for (const row of rows ?? []) {
      const tz = lookup(row.latitude, row.longitude);
      if (!tz || tz === row.timezone) {
        skipped++;
        continue;
      }
      const { error: updateError } = await supabase.from("listings").update({ timezone: tz }).eq("id", row.id);
      if (updateError) {
        console.error("Failed to update time zone", row.id, updateError.message);
        skipped++;
      } else {
        updated++;
      }
    }

    log({ ok: true, backfill: body?.backfill === true, updated, skipped });
    return json({ updated, skipped });
  } catch (err) {
    console.error("listing-timezone failed:", err);
    return json({ error: "Could not update time zones" }, 500);
  }
});
