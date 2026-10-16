-- Batch P2: proof that the live database matches 20261016090000_batch_p2.sql
-- and the perk-logos bucket set up through Lovable's Storage settings.
-- P2b: the bucket is PRIVATE (the workspace allows no public buckets); anyone
-- can read its files through the "Anyone can read perk logos" policy, and the
-- app shows them through signed links. The 512 KB limit is checked in the
-- admin uploader; the bucket has no size limit unless one is set in Storage.
-- READ-ONLY. One row per check; every row should have ok = true.

SELECT 'perk_clicks.placement: only the six placements' AS item,
       'perks_page, sit_confirmed, sit_upcoming, sit_now, dashboard, menu; not null' AS expected,
       COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'perk_clicks_placement_check'), 'missing') AS actual,
       EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = 'perk_clicks_placement_check'
               AND (SELECT bool_and(position(quote_literal(v) IN pg_get_constraintdef(c.oid)) > 0)
                    FROM unnest(ARRAY['perks_page', 'sit_confirmed', 'sit_upcoming', 'sit_now', 'dashboard', 'menu']) v))
         AND (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'perk_clicks' AND column_name = 'placement') = 'NO' AS ok

UNION ALL
SELECT 'perks.short_title: up to 30 characters', 'check constraint',
       COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'perks_short_title_length_check'), 'missing'),
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perks_short_title_length_check' AND pg_get_constraintdef(oid) ~ '30')

UNION ALL
SELECT 'bucket perk-logos: private', 'private; size limit 524288 bytes or none (checked in the admin uploader)',
       COALESCE((SELECT format('public %s, %s', public, COALESCE(file_size_limit::text || ' bytes', 'no size limit')) FROM storage.buckets WHERE id = 'perk-logos'), 'missing'),
       EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'perk-logos' AND NOT public AND (file_size_limit IS NULL OR file_size_limit <= 524288))

UNION ALL
SELECT 'perk-logos: anyone can read, this bucket only', 'SELECT for anon and authenticated, using only bucket_id = perk-logos',
       COALESCE((SELECT string_agg(format('%s %s: %s', policyname, roles, qual), '; ') FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can read perk logos'), 'missing'),
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname = 'Anyone can read perk logos' AND cmd = 'SELECT' AND permissive = 'PERMISSIVE'
               AND roles @> ARRAY['anon', 'authenticated']::name[]
               AND regexp_replace(qual, '[()[:space:]]', '', 'g') = 'bucket_id=''perk-logos''::text')

UNION ALL
SELECT 'bucket perk-logos: file types limited', 'by the bucket''s types, or by the upload rule (png, webp, svg, jpg, jpeg)',
       COALESCE(t.way, 'not limited'),
       t.way IS NOT NULL
FROM (
  SELECT (SELECT CASE
            WHEN b.allowed_mime_types IS NOT NULL
                 AND (SELECT bool_and(x IN ('image/png', 'image/webp', 'image/svg+xml', 'image/jpeg')) FROM unnest(b.allowed_mime_types) x)
              THEN 'by the bucket''s file types'
            WHEN b.allowed_mime_types IS NULL
                 AND EXISTS (SELECT 1 FROM pg_policies p
                             WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'INSERT'
                               AND p.policyname = 'Admins upload perk logos'
                               AND position('lower(storage.extension(name))' IN p.with_check) > 0
                               AND (SELECT bool_and(position(quote_literal(e) IN p.with_check) > 0)
                                    FROM unnest(ARRAY['png', 'webp', 'svg', 'jpg', 'jpeg']) e))
              THEN 'by the upload rule (file extensions)'
          END
          FROM storage.buckets b WHERE b.id = 'perk-logos') AS way
) t

UNION ALL
SELECT format('perk-logos %s policy: admins only', x.cmd), 'checks is_admin_user',
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
SELECT 'perk-logos: no other policy lets members write to it', 'every permissive write policy without a bucket names its bucket',
       COALESCE((SELECT string_agg(policyname, ', ') FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                   AND permissive = 'PERMISSIVE' AND position('bucket_id = ''' IN COALESCE(with_check, qual, '')) = 0), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                     AND permissive = 'PERMISSIVE' AND position('bucket_id = ''' IN COALESCE(with_check, qual, '')) = 0)

UNION ALL
SELECT 'perks: still no member or visitor access', 'no privileges at all',
       format('member %s, visitor %s',
              has_any_column_privilege('authenticated', 'public.perks', 'SELECT,INSERT,UPDATE') OR has_table_privilege('authenticated', 'public.perks', 'DELETE'),
              has_any_column_privilege('anon', 'public.perks', 'SELECT,INSERT,UPDATE') OR has_table_privilege('anon', 'public.perks', 'DELETE')),
       NOT has_any_column_privilege('authenticated', 'public.perks', 'SELECT,INSERT,UPDATE') AND NOT has_table_privilege('authenticated', 'public.perks', 'DELETE')
         AND NOT has_any_column_privilege('anon', 'public.perks', 'SELECT,INSERT,UPDATE') AND NOT has_table_privilege('anon', 'public.perks', 'DELETE')

UNION ALL
SELECT 'perk_clicks: no visitor access; members only through admin policies', 'anon none; only "Admins can view perk clicks"',
       format('visitor %s, policies %s',
              has_any_column_privilege('anon', 'public.perk_clicks', 'SELECT,INSERT,UPDATE') OR has_table_privilege('anon', 'public.perk_clicks', 'DELETE'),
              COALESCE((SELECT string_agg(policyname || ' ' || cmd, '; ') FROM pg_policies WHERE schemaname = 'public' AND tablename = 'perk_clicks'), 'none')),
       NOT has_any_column_privilege('anon', 'public.perk_clicks', 'SELECT,INSERT,UPDATE') AND NOT has_table_privilege('anon', 'public.perk_clicks', 'DELETE')
         AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.perk_clicks'::regclass)
         AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'perk_clicks'
                         AND COALESCE(qual, '') || COALESCE(with_check, '') !~ 'is_admin_user')

UNION ALL
SELECT 'get_member_perks: short_title, never the code, link or subid', 'has short_title; no discount_code, affiliate_url or subid_param',
       COALESCE(pg_get_function_result(to_regprocedure('public.get_member_perks()')), 'missing'),
       to_regprocedure('public.get_member_perks()') IS NOT NULL
         AND pg_get_function_result(to_regprocedure('public.get_member_perks()')) ~ 'short_title text'
         AND pg_get_function_result(to_regprocedure('public.get_member_perks()')) !~ '(discount_code|affiliate_url|subid_param)'
         AND NOT has_function_privilege('anon', 'public.get_member_perks()', 'EXECUTE')

UNION ALL
SELECT 'admin_perk_click_stats: clicks by placement, admins only', 'by_placement; is_admin_user check',
       COALESCE(pg_get_function_result(to_regprocedure('public.admin_perk_click_stats()')), 'missing'),
       to_regprocedure('public.admin_perk_click_stats()') IS NOT NULL
         AND pg_get_function_result(to_regprocedure('public.admin_perk_click_stats()')) ~ 'by_placement jsonb'
         AND (SELECT prosrc ~ 'is_admin_user' FROM pg_proc WHERE oid = to_regprocedure('public.admin_perk_click_stats()'))
         AND NOT has_function_privilege('anon', 'public.admin_perk_click_stats()', 'EXECUTE')

ORDER BY ok, item;
