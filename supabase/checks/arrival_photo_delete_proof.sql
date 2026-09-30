-- Arrival Check-In photo delete: proof that the live database matches
-- 20260930090000_arrival_photo_delete.sql (or Lovable's copy of it).
-- READ-ONLY. One row per check; every row should have ok = true.

SELECT 'arrival_vault_photos.taken_at' AS item, 'timestamptz' AS expected,
       COALESCE((SELECT data_type FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'arrival_vault_photos' AND column_name = 'taken_at'), 'missing') AS actual,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'arrival_vault_photos' AND column_name = 'taken_at'
                 AND data_type = 'timestamp with time zone') AS ok

UNION ALL
SELECT 'only one DELETE policy on arrival_vault_photos, with the evidence check', '1, checks evidence',
       (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'DELETE')
         || ', ' || COALESCE((SELECT CASE WHEN qual ILIKE '%arrival_photo_is_evidence%' THEN 'checks evidence' ELSE 'no evidence check' END
                              FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'DELETE' LIMIT 1), '-'),
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'DELETE') = 1
         AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'DELETE'
                     AND qual ILIKE '%auth.uid()%' AND qual ILIKE '%arrival_photo_is_evidence%')

UNION ALL
SELECT 'no ALL policy on arrival_vault_photos (it would also allow deletes)', 'none',
       COALESCE((SELECT string_agg(policyname, ', ') FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'ALL'), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'ALL')

UNION ALL
SELECT 'only one DELETE policy for arrival-vault-photos files, own folder, deletable check', '1, own folder, checked',
       (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'DELETE' AND qual ILIKE '%arrival-vault-photos%'),
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'DELETE' AND qual ILIKE '%arrival-vault-photos%') = 1
         AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'DELETE'
                     AND qual ILIKE '%arrival-vault-photos%' AND qual ILIKE '%foldername%' AND qual ILIKE '%arrival_photo_file_deletable%')

UNION ALL
SELECT format('function %s: definer, members yes, anon no', f), 'as planned',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND p.prosecdef
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM (VALUES ('arrival_photo_is_evidence'), ('arrival_photo_file_deletable')) AS v(f)
LEFT JOIN pg_proc p ON p.proname = v.f AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT 'arrival photo files in storage (for the location-data clean-up)', 'count',
       (SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'arrival-vault-photos'),
       true

ORDER BY ok, item;
