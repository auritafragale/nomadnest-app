-- Batch C fixes: proof that the live database matches
-- 20261004090000_batch_c_fixes.sql (or Lovable's copy of it).
-- READ-ONLY. One row per check; every row should have ok = true.

SELECT 'get_listing_applicants returns the sit and its status' AS item, 'sit_id uuid, sit_status text' AS expected,
       COALESCE(pg_get_function_result(to_regprocedure('public.get_listing_applicants(uuid)')), 'missing') AS actual,
       COALESCE(pg_get_function_result(to_regprocedure('public.get_listing_applicants(uuid)')) ~ 'sit_id uuid, sit_status text', false) AS ok

UNION ALL
SELECT 'get_listing_applicants: definer, members only, reads profiles.id_verified', 'definer, member yes, anon no, no sp.id_verified',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
                 || ', reads sp.id_verified ' || (p.prosrc ~ 'sp\.id_verified')::text END,
       p.oid IS NOT NULL AND p.prosecdef
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
         AND p.prosrc !~ 'sp\.id_verified'
         AND p.prosrc ~ 'p\.id_verified'
FROM (SELECT 1) one
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.get_listing_applicants(uuid)')

UNION ALL
SELECT 'members cannot read applications.owner_seen_at', 'no SELECT for authenticated or anon',
       'member ' || has_column_privilege('authenticated', 'public.applications', 'owner_seen_at', 'SELECT')::text
         || ', anon ' || has_column_privilege('anon', 'public.applications', 'owner_seen_at', 'SELECT')::text,
       NOT has_column_privilege('authenticated', 'public.applications', 'owner_seen_at', 'SELECT')
         AND NOT has_column_privilege('anon', 'public.applications', 'owner_seen_at', 'SELECT')

UNION ALL
SELECT format('members can still read applications.%s', a.attname), 'SELECT for authenticated',
       has_column_privilege('authenticated', 'public.applications', a.attname, 'SELECT')::text,
       has_column_privilege('authenticated', 'public.applications', a.attname, 'SELECT')
FROM pg_attribute a
WHERE a.attrelid = 'public.applications'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attname <> 'owner_seen_at'

UNION ALL
SELECT format('trigger %s', t.name), 'enabled',
       COALESCE((SELECT CASE tg.tgenabled WHEN 'O' THEN 'enabled' ELSE 'state ' || tg.tgenabled::text END
                 FROM pg_trigger tg WHERE tg.tgrelid = t.rel::regclass AND tg.tgname = t.name), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = t.rel::regclass AND tg.tgname = t.name AND tg.tgenabled = 'O')
FROM (VALUES ('sync_sitter_id_verified', 'public.profiles'), ('set_new_sitter_id_verified', 'public.sitter_profiles')) AS t(name, rel)

UNION ALL
SELECT 'the sitter_profiles guard lets the sync through', 'mentions app.sync_id_verified',
       CASE WHEN p.oid IS NULL THEN 'missing' WHEN p.prosrc ~ 'app\.sync_id_verified' THEN 'yes' ELSE 'no' END,
       p.oid IS NOT NULL AND p.prosrc ~ 'app\.sync_id_verified'
FROM (SELECT 1) one
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.prevent_sitter_verification_escalation()')

UNION ALL
SELECT 'sync functions are server only', 'member no, anon no',
       string_agg(f.sig || ' member ' || has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE')::text, '; '),
       bool_and(to_regprocedure(f.sig) IS NOT NULL
                AND NOT has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE')
                AND NOT has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE'))
FROM (VALUES ('public.sync_sitter_id_verified()'), ('public.set_new_sitter_id_verified()')) AS f(sig)

UNION ALL
SELECT 'sitter_profiles.id_verified matches profiles.id_verified for everyone', '0 out of step',
       (SELECT count(*)::text FROM public.sitter_profiles sp JOIN public.profiles p ON p.id = sp.user_id
        WHERE sp.id_verified IS DISTINCT FROM COALESCE(p.id_verified, false)) || ' out of step',
       NOT EXISTS (SELECT 1 FROM public.sitter_profiles sp JOIN public.profiles p ON p.id = sp.user_id
                   WHERE sp.id_verified IS DISTINCT FROM COALESCE(p.id_verified, false));
