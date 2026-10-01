import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import postgres from "npm:postgres@3.4.4";
import { stripPhotoMetadata } from "../_shared/photo-metadata.ts";

// Admin-only, one-off: removes location and other metadata from photos that
// were uploaded before photos were cleaned on the device. Byte-level, no
// re-encoding, so pictures are unchanged (see _shared/photo-metadata.ts).
//
// Body: { mode?: "dry_run" | "run", cursor?: Cursor }
//   dry_run (default) only counts. run rewrites files that had metadata.
//   Each call handles one batch of up to 50 files and returns a cursor;
//   call again with it until done is true. The cursor is just numbers.
//
// Never touches id-verification-documents. Responses and logs hold counts
// only: never file names, paths, coordinates or user ids.
//
// Rewriting a file through the Storage API resets its owner, which storage
// policies, delete-account and export use. So for each rewritten file the
// original owner is read first and put back straight after, through a
// direct database connection. A run stops before changing anything if that
// connection can't do it.

const BUCKETS = [
  "listing-images", // listing photos and avatars, seen by other members
  "chat-photos",
  "welcome-guide-photos",
  "sit-update-photos",
  "report-evidence",
  "arrival-vault-photos",
] as const;
const BATCH = 50;
const MAX_BYTES = 25 * 1024 * 1024;

interface Counts {
  scanned: number;
  had_gps: number;
  had_other_metadata: number;
  cleaned: number;
  skipped: number;
  failed: number;
}
interface Cursor {
  mode: "dry_run" | "run";
  /** Index into BUCKETS. */
  b: number;
  /** Files already handled in that bucket (ordered by name). */
  o: number;
  totals: Record<string, Counts>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const log = (entry: Record<string, unknown>) => console.log(JSON.stringify({ fn: "strip-photo-metadata", ...entry }));

const zero = (): Counts => ({ scanned: 0, had_gps: 0, had_other_metadata: 0, cleaned: 0, skipped: 0, failed: 0 });
const freshTotals = () => Object.fromEntries(BUCKETS.map((b) => [b, zero()])) as Record<string, Counts>;

/** Accept only a well-formed cursor of numbers; anything else starts over. */
const readCursor = (raw: unknown, mode: Cursor["mode"]): Cursor => {
  const c = raw as Partial<Cursor> | null;
  if (
    !c ||
    c.mode !== mode ||
    !Number.isInteger(c.b) ||
    !Number.isInteger(c.o) ||
    (c.b as number) < 0 ||
    (c.o as number) < 0 ||
    typeof c.totals !== "object" ||
    c.totals === null
  ) {
    return { mode, b: 0, o: 0, totals: freshTotals() };
  }
  const totals = freshTotals();
  for (const name of BUCKETS) {
    const t = (c.totals as Record<string, Partial<Counts>>)[name] ?? {};
    for (const k of Object.keys(totals[name]) as (keyof Counts)[]) {
      const v = t[k];
      totals[name][k] = Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0;
    }
  }
  return { mode, b: c.b as number, o: c.o as number, totals };
};

/** Storage keeps cache-control as "max-age=N"; the upload API wants "N". */
const cacheSeconds = (v: string | null) => {
  const m = /(\d+)/.exec(v ?? "");
  return m ? m[1] : "3600";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  });

  // Same admin check as the other admin functions (profiles.is_admin).
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
  const user = userData?.user;
  if (!user) return json({ error: "Please sign in again." }, 401);
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (profile?.is_admin !== true) {
    log({ rejected: "not_admin" });
    return json({ error: "Admins only." }, 403);
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    log({ rejected: "no_db_url" });
    return json({ error: "The database connection isn't available to this function, so nothing was checked or changed." }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const mode: Cursor["mode"] = body?.mode === "run" ? "run" : "dry_run";
  const cursor = readCursor(body?.cursor, mode);
  const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });
  const batch: Record<string, Counts> = {};

  try {
    // Orphaned Arrival Check-In files: no photo row and not flag evidence. Count only.
    const [{ orphans }] = await sql<{ orphans: number }[]>`
      SELECT count(*)::int AS orphans
      FROM storage.objects o
      WHERE o.bucket_id = 'arrival-vault-photos'
        AND o.name NOT LIKE '%.emptyFolderPlaceholder'
        AND NOT EXISTS (SELECT 1 FROM public.arrival_vault_photos v WHERE v.photo_url = o.name)
        AND NOT EXISTS (SELECT 1 FROM public.review_flag_evidence e WHERE e.photo_url = o.name)`;

    if (cursor.b >= BUCKETS.length) {
      return json({ mode, done: true, cursor: null, buckets: cursor.totals, arrival_orphans: orphans });
    }

    const bucket = BUCKETS[cursor.b];
    const rows = await sql<{ name: string; mimetype: string | null; cache_control: string | null; owner: string | null; owner_id: string | null }[]>`
      SELECT name, metadata->>'mimetype' AS mimetype, metadata->>'cacheControl' AS cache_control, owner::text AS owner, owner_id
      FROM storage.objects
      WHERE bucket_id = ${bucket} AND name NOT LIKE '%.emptyFolderPlaceholder'
      ORDER BY name
      LIMIT ${BATCH} OFFSET ${cursor.o}`;

    // Before any rewrite: make sure owners can be put back. No-op update on the first file.
    if (mode === "run" && rows.length > 0) {
      const probe = await sql`
        UPDATE storage.objects SET owner_id = owner_id
        WHERE bucket_id = ${bucket} AND name = ${rows[0].name}
        RETURNING 1`;
      if (probe.length !== 1) throw new Error("owner_restore_unavailable");
    }

    const counts = zero();
    for (const row of rows) {
      counts.scanned++;
      try {
        const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(row.name);
        if (downloadError || !blob) {
          counts.failed++;
          continue;
        }
        if (blob.size > MAX_BYTES) {
          counts.skipped++;
          continue;
        }
        const result = stripPhotoMetadata(new Uint8Array(await blob.arrayBuffer()));
        if (result.kind === "other") {
          counts.skipped++;
          continue;
        }
        if (result.hadGps) counts.had_gps++;
        else if (result.hadMetadata) counts.had_other_metadata++;
        if (mode !== "run" || !result.changed) continue;

        const contentType =
          row.mimetype || (result.kind === "jpeg" ? "image/jpeg" : result.kind === "png" ? "image/png" : "image/webp");
        const { error: uploadError } = await supabase.storage.from(bucket).upload(row.name, result.bytes, {
          upsert: true,
          contentType,
          cacheControl: cacheSeconds(row.cache_control),
        });
        if (uploadError) {
          counts.failed++;
          continue;
        }
        // Put the original owner back (the upload above reset it). If that
        // ever fails, stop the whole run rather than carry on.
        try {
          await sql`
            UPDATE storage.objects SET owner = ${row.owner}::uuid, owner_id = ${row.owner_id}
            WHERE bucket_id = ${bucket} AND name = ${row.name}`;
        } catch {
          counts.failed++;
          batch[bucket] = counts;
          throw new Error("owner_restore_failed");
        }
        counts.cleaned++;
      } catch (err) {
        if (err instanceof Error && err.message === "owner_restore_failed") throw err;
        counts.failed++;
      }
    }

    batch[bucket] = counts;
    const totals = cursor.totals;
    for (const k of Object.keys(counts) as (keyof Counts)[]) totals[bucket][k] += counts[k];
    const next: Cursor = rows.length < BATCH ? { mode, b: cursor.b + 1, o: 0, totals } : { mode, b: cursor.b, o: cursor.o + rows.length, totals };
    const done = next.b >= BUCKETS.length;

    log({ mode, batch, done });
    return json({ mode, done, cursor: done ? null : next, buckets: totals, arrival_orphans: orphans });
  } catch (err) {
    const reason =
      err instanceof Error && (err.message === "owner_restore_unavailable" || err.message === "owner_restore_failed") ? err.message : "error";
    log({ mode, failed: reason, batch });
    return json(
      {
        error:
          reason === "owner_restore_unavailable"
            ? "File owners can't be restored from this function, so nothing was changed."
            : reason === "owner_restore_failed"
              ? "The clean-up stopped: one file's owner couldn't be put back. Please tell the developer before running it again."
              : "The clean-up stopped. Nothing else was changed; you can run it again.",
      },
      500,
    );
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
});
