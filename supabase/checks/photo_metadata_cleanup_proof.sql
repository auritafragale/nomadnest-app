-- Photo privacy clean-up (strip-photo-metadata): read-only proof.
-- READ-ONLY. Nothing here changes data.
--
-- Updated (F1d): the old "compare two fingerprints" baseline is replaced by
-- rows that check today's rules directly (members add ID drafts at any time,
-- and F1c/F1d changed storage on purpose, so a fixed baseline kept going
-- stale). Query 1: every row should have ok = true. Queries 2 to 4 are for
-- reading. The function itself can't be seen from SQL; the admin card's
-- "Check" returning a counts table confirms it is deployed (anyone who isn't
-- an admin gets 403).

-- 1. Rules (every row ok = true).
WITH private_bucket(id) AS (VALUES
  ('id-verification-documents'), ('welcome-guide-photos'), ('chat-photos'),
  ('report-evidence'), ('arrival-vault-photos')
)
SELECT format('bucket %s is private', pb.id) AS item, 'public = false' AS expected,
       COALESCE((SELECT 'public = ' || b.public::text FROM storage.buckets b WHERE b.id = pb.id), 'missing') AS actual,
       EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = pb.id AND NOT b.public) AS ok
FROM private_bucket pb

UNION ALL
SELECT format('bucket %s: no unconditional read policy', pb.id), 'every SELECT policy also checks who is asking',
       COALESCE((SELECT string_agg(p.policyname, ', ') FROM pg_policies p
                 WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('SELECT', 'ALL')
                   AND COALESCE(p.qual, '') ~ pb.id
                   AND regexp_replace(COALESCE(p.qual, ''), '[()[:space:]]', '', 'g')
                       = format('bucket_id=%L::text', pb.id)), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_policies p
                   WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('SELECT', 'ALL')
                     AND COALESCE(p.qual, '') ~ pb.id
                     AND regexp_replace(COALESCE(p.qual, ''), '[()[:space:]]', '', 'g')
                         = format('bucket_id=%L::text', pb.id))
FROM private_bucket pb

UNION ALL
SELECT 'bucket id-verification-documents: limit and types', '10MB; jpeg, png, webp, heic, heif, pdf',
       COALESCE((SELECT COALESCE(file_size_limit::text, 'no limit') || ' bytes; ' || COALESCE(array_to_string(allowed_mime_types, ', '), 'any type')
                 FROM storage.buckets WHERE id = 'id-verification-documents'), 'missing'),
       EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'id-verification-documents' AND file_size_limit = 10485760
                 AND (SELECT array_agg(t ORDER BY t) FROM unnest(allowed_mime_types) t)
                     = ARRAY['application/pdf', 'image/heic', 'image/heif', 'image/jpeg', 'image/png', 'image/webp'])

ORDER BY ok, item;

-- 2. Bucket settings, for reading.
SELECT id AS bucket, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- 3. Files per bucket, how many have no owner, and when files last changed.
--    After "Clean now", files_without_owner must not have gone up (the
--    function puts each file's owner back), and id-verification-documents'
--    last_changed must not move because of it (since Batch F1c members
--    add ID drafts at any time, so compare just before and after the run).
SELECT bucket_id AS bucket,
       count(*) AS files,
       count(*) FILTER (WHERE owner_id IS NULL) AS files_without_owner,
       max(updated_at) AS last_changed
FROM storage.objects
WHERE name NOT LIKE '%.emptyFolderPlaceholder'
GROUP BY bucket_id
ORDER BY bucket_id;

-- 4. Arrival Check-In files with no photo row and not flag evidence (the
--    function counts these too; nothing is deleted).
SELECT 'orphaned arrival-vault-photos files' AS item, count(*) AS value
FROM storage.objects o
WHERE o.bucket_id = 'arrival-vault-photos'
  AND o.name NOT LIKE '%.emptyFolderPlaceholder'
  AND NOT EXISTS (SELECT 1 FROM public.arrival_vault_photos v WHERE v.photo_url = o.name)
  AND NOT EXISTS (SELECT 1 FROM public.review_flag_evidence e WHERE e.photo_url = o.name);
