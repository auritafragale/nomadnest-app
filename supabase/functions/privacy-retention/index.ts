import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { redact } from "../_shared/safe-log.ts";
import { errorBody, statusFor, type Reason } from "../_shared/http-status.ts";

// Daily privacy retention (pg_cron -> request_privacy_retention -> here, with
// x-internal-secret from Vault). Internal callers only.
//  1. ID documents: 30 days after an admin decision, the passport/ID and
//     selfie images are deleted from storage and their paths cleared.
//  2. Safety records about deleted accounts: 24 months after deletion, the
//     reports, flags and strikes about them are deleted, with the reports'
//     evidence files.
//  3. ID drafts: photos a member picked on Verify your identity but never
//     sent ({uid}/draft/...), 24 hours after upload.
// Logs contain counts only.

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fail = (reason: Reason, error: string, extra: Record<string, unknown> = {}) => json(errorBody(reason, error, extra), statusFor(reason));

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify({ fn: "privacy-retention", ...entry }));

const safeEqual = (a: string, b: string) => {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

serve(async (req) => {
  if (req.method !== "POST") return fail("method_not_allowed", "Method not allowed");

  const expected = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (!expected || !safeEqual(provided, expected)) {
    log({ rejected: "internal_secret_mismatch" });
    return fail("internal_only", "Internal callers only.");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    // 1) ID documents
    const { data: expired, error: expiredError } = await admin.rpc("expired_id_documents");
    if (expiredError) throw new Error(`expired_id_documents failed: ${expiredError.message}`);
    const rows = (expired ?? []) as { id: string; id_photo_path: string | null; selfie_path: string | null }[];
    const paths = rows.flatMap((r) => [r.id_photo_path, r.selfie_path]).filter((p): p is string => !!p);
    let idFilesDeleted = 0;
    let idFilesFailed = false;
    for (let i = 0; i < paths.length; i += 100) {
      const { data: removed, error } = await admin.storage.from("id-verification-documents").remove(paths.slice(i, i + 100));
      if (error) {
        idFilesFailed = true;
        log({ step: "id_documents", failed: redact(error.message) });
      } else {
        idFilesDeleted += removed?.length ?? 0;
      }
    }
    let idRowsCleared = 0;
    if (rows.length && !idFilesFailed) {
      const { data: n, error } = await admin.rpc("mark_id_documents_deleted", { p_ids: rows.map((r) => r.id) });
      if (error) throw new Error(`mark_id_documents_deleted failed: ${error.message}`);
      idRowsCleared = (n as number) ?? 0;
    }

    // 2) Safety records about deleted accounts
    const { data: purged, error: purgeError } = await admin.rpc("purge_expired_safety_records");
    if (purgeError) throw new Error(`purge_expired_safety_records failed: ${purgeError.message}`);
    const evidence = (((purged as { evidence_paths?: string[] })?.evidence_paths) ?? []).filter(Boolean);
    let evidenceDeleted = 0;
    for (let i = 0; i < evidence.length; i += 100) {
      const { data: removed, error } = await admin.storage.from("report-evidence").remove(evidence.slice(i, i + 100));
      if (error) log({ step: "report_evidence", failed: redact(error.message) });
      else evidenceDeleted += removed?.length ?? 0;
    }

    // 3) Unsent ID drafts older than 24 hours
    const { data: drafts, error: draftsError } = await admin.rpc("expired_id_drafts");
    if (draftsError) throw new Error(`expired_id_drafts failed: ${draftsError.message}`);
    const draftPaths = ((drafts ?? []) as { name: string }[]).map((d) => d.name).filter(Boolean);
    let draftsDeleted = 0;
    for (let i = 0; i < draftPaths.length; i += 100) {
      const { data: removed, error } = await admin.storage.from("id-verification-documents").remove(draftPaths.slice(i, i + 100));
      if (error) log({ step: "id_drafts", failed: redact(error.message) });
      else draftsDeleted += removed?.length ?? 0;
    }

    // 4) Phone verification attempts (hashes only) older than 30 days
    const { data: phoneAttempts, error: phoneError } = await admin.rpc("purge_phone_verify_attempts");
    if (phoneError) log({ step: "phone_attempts", failed: redact(phoneError.message) });

    const summary = {
      phone_attempts_deleted: typeof phoneAttempts === "number" ? phoneAttempts : 0,
      id_files_deleted: idFilesDeleted,
      id_drafts_deleted: draftsDeleted,
      id_rows_cleared: idRowsCleared,
      accounts_purged: (purged as { accounts_purged?: number })?.accounts_purged ?? 0,
      evidence_files_deleted: evidenceDeleted,
    };
    log({ ok: true, ...summary });
    return json({ ok: true, ...summary });
  } catch (err) {
    log({ failed: redact(err) });
    return json({ error: "Retention run failed." }, 500);
  }
});
