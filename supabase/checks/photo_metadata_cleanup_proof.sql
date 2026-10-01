-- Photo privacy clean-up (strip-photo-metadata): read-only proof.
-- READ-ONLY. Nothing here changes data.
--
-- How to use:
--   1. Run it BEFORE deploying the function and keep the result.
--   2. Run it again after deploying, and again after "Clean now".
--   The two fingerprints must be identical every time: no storage policy and
--   no bucket setting changed. The function itself can't be seen from SQL;
--   the admin card's "Check" returning a counts table confirms it is
--   deployed (and that only admins can call it: anyone else gets 403).

-- 1. Fingerprints (compare across runs).
SELECT 'storage policies fingerprint' AS item,
       md5(string_agg(format('%s|%s|%s|%s|%s', policyname, cmd, roles::text, COALESCE(qual, ''), COALESCE(with_check, '')), E'\n' ORDER BY policyname, cmd)) AS value
FROM pg_policies WHERE schemaname = 'storage'
UNION ALL
SELECT 'bucket settings fingerprint',
       md5(string_agg(format('%s|%s|%s|%s', id, public, COALESCE(file_size_limit::text, ''), COALESCE(allowed_mime_types::text, '')), E'\n' ORDER BY id))
FROM storage.buckets;

-- 2. Bucket settings, for reading.
SELECT id AS bucket, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- 3. Files per bucket, how many have no owner, and when files last changed.
--    After "Clean now", files_without_owner must not have gone up (the
--    function puts each file's owner back), and id-verification-documents'
--    last_changed must not move (it is never touched).
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
