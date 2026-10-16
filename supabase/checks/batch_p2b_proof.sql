-- Batch P2b: proof that the live database matches 20261016120000_batch_p2b.sql.
-- READ-ONLY. One row per check; every row should have ok = true.
-- Perk logos come from the private perk-logos bucket through signed links:
-- anyone can read that bucket, and only that bucket; logo_url holds a file
-- name in it, never a web link.

SELECT 'bucket perk-logos: private' AS item, 'exists, not public' AS expected,
       COALESCE((SELECT format('public %s', public) FROM storage.buckets WHERE id = 'perk-logos'), 'missing') AS actual,
       EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'perk-logos' AND NOT public) AS ok

UNION ALL
SELECT 'perk-logos: anyone can read, this bucket only', 'SELECT for anon and authenticated, using only bucket_id = perk-logos',
       COALESCE((SELECT format('%s %s: %s', cmd, roles, qual) FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can read perk logos'), 'missing'),
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname = 'Anyone can read perk logos' AND cmd = 'SELECT' AND permissive = 'PERMISSIVE'
               AND roles @> ARRAY['anon', 'authenticated']::name[]
               AND regexp_replace(qual, '[()[:space:]]', '', 'g') = 'bucket_id=''perk-logos''::text')

UNION ALL
SELECT 'storage: visitors can read no other bucket', 'the only visitor read policy is "Anyone can read perk logos"',
       COALESCE((SELECT string_agg(policyname, ', ') FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('SELECT', 'ALL')
                   AND roles && ARRAY['anon', 'public']::name[]), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('SELECT', 'ALL')
                     AND roles && ARRAY['anon', 'public']::name[] AND policyname <> 'Anyone can read perk logos')

UNION ALL
SELECT format('perk-logos %s: still admins only', x.cmd), 'is_admin_user',
       COALESCE((SELECT string_agg(policyname, ', ') FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = x.cmd
                   AND position('perk-logos' IN COALESCE(qual, '') || COALESCE(with_check, '')) > 0), 'missing'),
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = x.cmd
               AND position('perk-logos' IN COALESCE(qual, '') || COALESCE(with_check, '')) > 0)
         AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN (x.cmd, 'ALL')
                         AND permissive = 'PERMISSIVE'
                         AND position('perk-logos' IN COALESCE(qual, '') || COALESCE(with_check, '')) > 0
                         AND position('is_admin_user' IN COALESCE(qual, '') || COALESCE(with_check, '')) = 0)
FROM (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS x(cmd)

UNION ALL
SELECT 'perks.logo_url: a file name only', 'check constraint perks_logo_url_file_check',
       COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'perks_logo_url_file_check'), 'missing'),
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perks_logo_url_file_check' AND conrelid = 'public.perks'::regclass AND convalidated)

UNION ALL
SELECT 'perks.logo_url: no web links left', '0 perks with a link or other value',
       format('%s with a link, %s with a file name, %s empty',
              count(*) FILTER (WHERE logo_url ~* '^(https?:|data:)'),
              count(*) FILTER (WHERE logo_url ~* '^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(png|webp|svg|jpe?g)$'),
              count(*) FILTER (WHERE logo_url IS NULL)),
       count(*) FILTER (WHERE logo_url IS NOT NULL AND logo_url !~* '^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(png|webp|svg|jpe?g)$') = 0
FROM public.perks

UNION ALL
SELECT 'perks with a logo file that is missing', '0 (or upload the file again)',
       COALESCE((SELECT string_agg(p.slug, ', ') FROM public.perks p
                 WHERE p.logo_url IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'perk-logos' AND o.name = p.logo_url)), 'none'),
       NOT EXISTS (SELECT 1 FROM public.perks p
                   WHERE p.logo_url IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'perk-logos' AND o.name = p.logo_url))

ORDER BY ok, item;
