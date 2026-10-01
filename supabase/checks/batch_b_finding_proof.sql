-- Batch B (finding each other): proof that the live database matches
-- 20261002090000_batch_b_finding.sql (or Lovable's copy of it).
-- READ-ONLY. One row per check; every row should have ok = true.

SELECT format('flag %s exists', k) AS item, 'present (off until you switch it on)' AS expected,
       COALESCE((SELECT value::text FROM public.app_settings WHERE key = k), 'missing') AS actual,
       EXISTS (SELECT 1 FROM public.app_settings WHERE key = k) AS ok
FROM (VALUES ('ai_nomad_match_enabled'), ('ai_invite_cowriter_enabled')) AS v(k)

UNION ALL
SELECT 'public_founding_spots: definer, anon and members can run it', 'definer, anon yes, member yes',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND p.prosecdef
         AND has_function_privilege('anon', p.oid, 'EXECUTE')
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
FROM (SELECT 1) one
LEFT JOIN pg_proc p ON p.proname = 'public_founding_spots' AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT 'public_founding_spots returns only spots_left and cap', 'spots_left integer, cap integer',
       COALESCE(pg_get_function_result('public.public_founding_spots()'::regprocedure), 'missing'),
       pg_get_function_result('public.public_founding_spots()'::regprocedure) = 'TABLE(spots_left integer, cap integer)'

UNION ALL
SELECT 'public_founding_spots: current values (spots left never below 0)', 'spots_left >= 0',
       (SELECT spots_left::text || ' of ' || cap::text FROM public.public_founding_spots()),
       (SELECT spots_left >= 0 AND spots_left <= cap FROM public.public_founding_spots())

UNION ALL
SELECT 'nomad_match_cache: RLS on, no member or anon access', 'rls on, none',
       CASE WHEN c.oid IS NULL THEN 'missing'
            ELSE 'rls ' || c.relrowsecurity::text
                 || ', member ' || has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')::text
                 || ', anon ' || has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')::text END,
       c.oid IS NOT NULL AND c.relrowsecurity
         AND NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
         AND NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
         AND NOT has_any_column_privilege('authenticated', c.oid, 'SELECT')
FROM (SELECT 1) one
LEFT JOIN pg_class c ON c.relname = 'nomad_match_cache' AND c.relnamespace = 'public'::regnamespace

UNION ALL
SELECT 'nomad_match_cache rows go with their listing', 'ON DELETE CASCADE',
       COALESCE((SELECT confdeltype::text FROM pg_constraint WHERE conrelid = 'public.nomad_match_cache'::regclass AND contype = 'f'
                 AND confrelid = 'public.listings'::regclass), 'missing'),
       EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.nomad_match_cache'::regclass AND contype = 'f'
               AND confrelid = 'public.listings'::regclass AND confdeltype = 'c')

ORDER BY ok, item;
