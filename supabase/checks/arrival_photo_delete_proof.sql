-- Arrival Check-In photos: proof that the live database matches
-- 20260930090000_arrival_photo_delete.sql and
-- 20261001090000_arrival_photo_policies.sql (or Lovable's copies of them).
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
SELECT 'no ALL or UPDATE policy on arrival_vault_photos', 'none',
       COALESCE((SELECT string_agg(policyname || ' (' || cmd || ')', ', ') FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd IN ('ALL', 'UPDATE')), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd IN ('ALL', 'UPDATE'))

UNION ALL
SELECT 'member policies: one SELECT (own), one INSERT (own, own sit), one DELETE', '1 / 1 / 1',
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'SELECT'
          AND COALESCE(qual, '') NOT ILIKE '%is_admin%')::text || ' / ' ||
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'INSERT')::text || ' / ' ||
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'DELETE')::text,
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'SELECT'
          AND COALESCE(qual, '') NOT ILIKE '%is_admin%' AND qual ILIKE '%auth.uid()%') = 1
         AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'SELECT'
                AND COALESCE(qual, '') NOT ILIKE '%is_admin%') = 1
         AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'INSERT') = 1
         AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'INSERT'
                     AND with_check ILIKE '%auth.uid()%' AND with_check ILIKE '%arrival_photo_sit_is_mine%')
         AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'DELETE') = 1

UNION ALL
SELECT 'admin SELECT policy still there', 'present',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'SELECT'
                         AND qual ILIKE '%is_admin%') THEN 'present' ELSE 'missing' END,
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'SELECT'
               AND qual ILIKE '%is_admin%')

UNION ALL
SELECT 'no UPDATE privilege for members or signed-out visitors', 'none',
       'authenticated ' || has_any_column_privilege('authenticated', 'public.arrival_vault_photos', 'UPDATE')::text
         || ', anon ' || has_any_column_privilege('anon', 'public.arrival_vault_photos', 'UPDATE')::text,
       NOT has_any_column_privilege('authenticated', 'public.arrival_vault_photos', 'UPDATE')
         AND NOT has_any_column_privilege('anon', 'public.arrival_vault_photos', 'UPDATE')

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
FROM (VALUES ('arrival_photo_is_evidence'), ('arrival_photo_file_deletable'), ('arrival_photo_sit_is_mine')) AS v(f)
LEFT JOIN pg_proc p ON p.proname = v.f AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT 'arrival photo files in storage (for the location-data clean-up)', 'count',
       (SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'arrival-vault-photos'),
       true

ORDER BY ok, item;
