-- Batch P1: proof that the live database matches 20261015150000_batch_p1.sql.
-- READ-ONLY. One row per check; every row should have ok = true.

SELECT 'perks: no SELECT for visitors or members (table or any column)' AS item, 'none' AS expected,
       COALESCE((SELECT string_agg(DISTINCT grantee || ':' || column_name, ', ')
                 FROM information_schema.column_privileges
                 WHERE table_schema = 'public' AND table_name = 'perks' AND privilege_type = 'SELECT'
                   AND grantee IN ('PUBLIC', 'anon', 'authenticated')), 'none') AS actual,
       NOT has_table_privilege('anon', 'public.perks', 'SELECT')
         AND NOT has_table_privilege('authenticated', 'public.perks', 'SELECT')
         AND NOT has_any_column_privilege('anon', 'public.perks', 'SELECT')
         AND NOT has_any_column_privilege('authenticated', 'public.perks', 'SELECT') AS ok

UNION ALL
SELECT 'perks: no writes for visitors or members', 'no INSERT, UPDATE or DELETE',
       format('anon %s, member %s',
              has_any_column_privilege('anon', 'public.perks', 'INSERT,UPDATE') OR has_table_privilege('anon', 'public.perks', 'DELETE'),
              has_any_column_privilege('authenticated', 'public.perks', 'INSERT,UPDATE') OR has_table_privilege('authenticated', 'public.perks', 'DELETE')),
       NOT has_any_column_privilege('anon', 'public.perks', 'INSERT,UPDATE') AND NOT has_table_privilege('anon', 'public.perks', 'DELETE')
         AND NOT has_any_column_privilege('authenticated', 'public.perks', 'INSERT,UPDATE') AND NOT has_table_privilege('authenticated', 'public.perks', 'DELETE')

UNION ALL
SELECT 'perks: the public SELECT policy is gone', 'no policy for anon or everyone',
       COALESCE((SELECT string_agg(policyname, ', ') FROM pg_policies WHERE schemaname = 'public' AND tablename = 'perks'
                 AND cmd IN ('SELECT', 'ALL') AND (roles && ARRAY['anon', 'public']::name[] OR COALESCE(qual, '') !~ 'is_admin_user')), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'perks'
                   AND cmd IN ('SELECT', 'ALL') AND (roles && ARRAY['anon', 'public']::name[] OR COALESCE(qual, '') !~ 'is_admin_user'))

UNION ALL
SELECT 'get_perks_preview returns only the six safe columns', 'category, id, logo_url, name, sort_order, trip_moment',
       COALESCE(pg_get_function_result(to_regprocedure('public.get_perks_preview()')), 'missing'),
       pg_get_function_result(to_regprocedure('public.get_perks_preview()'))
         = 'TABLE(id uuid, name text, logo_url text, category text, trip_moment text, sort_order integer)'

UNION ALL
SELECT 'get_member_perks never returns the code, link or subid', 'no discount_code, affiliate_url or subid_param in the result',
       COALESCE(pg_get_function_result(to_regprocedure('public.get_member_perks()')), 'missing'),
       to_regprocedure('public.get_member_perks()') IS NOT NULL
         AND pg_get_function_result(to_regprocedure('public.get_member_perks()')) !~ '(discount_code|affiliate_url|subid_param)'
         AND pg_get_function_result(to_regprocedure('public.get_member_perks()')) ~ 'has_code boolean'

UNION ALL
SELECT format('function %s', f.sig), f.expect,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('definer %s, %s, visitor %s, member %s', p.prosecdef, COALESCE(array_to_string(p.proconfig, ','), 'no search_path'),
                        has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE')) END,
       p.oid IS NOT NULL AND p.prosecdef AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND has_function_privilege('anon', p.oid, 'EXECUTE') = f.anon
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = f.member
         AND (NOT f.side OR (position('has_side_access(' IN p.prosrc) > 0 AND p.prosrc ~ '''sitter''' AND p.prosrc ~ '''owner'''))
FROM (VALUES
  ('public.get_perks_preview()', true, true, false, 'definer, search_path, visitors and members'),
  ('public.get_member_perks()', false, true, true, 'definer, search_path, members only, has_side_access on either side'),
  ('public.get_perk_discount_code(text)', false, true, true, 'definer, search_path, members only, has_side_access on either side'),
  ('public.get_my_next_sit_for_perks()', false, true, true, 'definer, search_path, members only, has_side_access on either side'),
  ('public.admin_save_perk(uuid,jsonb)', false, true, false, 'definer, search_path, admin check inside'),
  ('public.admin_delete_perk(uuid)', false, true, false, 'definer, search_path, admin check inside')
) AS f(sig, anon, member, side, expect)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'admin write functions check is_admin_user', 'both',
       format('save %s, delete %s',
              COALESCE(position('is_admin_user' IN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.admin_save_perk(uuid,jsonb)'))) > 0, false),
              COALESCE(position('is_admin_user' IN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.admin_delete_perk(uuid)'))) > 0, false)),
       COALESCE(position('is_admin_user' IN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.admin_save_perk(uuid,jsonb)'))) > 0, false)
         AND COALESCE(position('is_admin_user' IN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.admin_delete_perk(uuid)'))) > 0, false)

UNION ALL
SELECT 'get_my_next_sit_for_perks: only the caller''s own sit', 'filters on auth.uid() as Nomad or Pet Parent',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ 's\.sitter_user_id = v_uid' AND p.prosrc ~ 's\.owner_user_id = v_uid')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ 's\.sitter_user_id = v_uid' AND p.prosrc ~ 's\.owner_user_id = v_uid' AND p.prosrc ~ 'v_uid uuid := auth\.uid\(\)'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.get_my_next_sit_for_perks()')

UNION ALL
SELECT 'one Perk of the month at most', 'unique partial index, and at most one row today',
       format('index %s, rows %s', to_regclass('public.perks_one_perk_of_month') IS NOT NULL,
              (SELECT count(*) FROM public.perks WHERE is_perk_of_month)),
       EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = to_regclass('public.perks_one_perk_of_month') AND i.indisunique AND i.indpred IS NOT NULL)
         AND (SELECT count(*) FROM public.perks WHERE is_perk_of_month) <= 1

UNION ALL
SELECT 'new columns and checks', 'trip_moment before/road/sit; headline amount rule',
       format('trip_moment %s, headline rule %s',
              EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perks_trip_moment_check'),
              EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perks_benefit_headline_amount_check')),
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perks_trip_moment_check')
         AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perks_benefit_headline_amount_check')
         AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'perks'
              AND column_name IN ('trip_moment', 'benefit_headline', 'benefit_subline', 'is_perk_of_month', 'spotlight_text', 'picked_for_sits')) = 6

UNION ALL
SELECT format('trip moment of %s', b.slug), b.moment,
       COALESCE((SELECT trip_moment FROM public.perks WHERE slug = b.slug), 'no such perk'),
       NOT EXISTS (SELECT 1 FROM public.perks WHERE slug = b.slug)
         OR (SELECT trip_moment FROM public.perks WHERE slug = b.slug) = b.moment
FROM (VALUES ('safetywing', 'before'), ('nomad-esim', 'before'), ('surfshark-vpn', 'before'),
             ('stasher', 'road'), ('getyourguide', 'road')) AS b(slug, moment)

ORDER BY ok, item;
