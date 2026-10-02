-- Batch C (Pet Parent tools): proof that the live database matches
-- 20261003090000_batch_c_parent_tools.sql (or Lovable's copy of it).
-- READ-ONLY. One row per check; every row should have ok = true.
-- The last rows list every function that reads a phone column, for review:
-- only get_my_contact_info (the member's own) and admin functions belong there.

SELECT 'flag ai_writing_helper_enabled exists' AS item, 'present (off until you switch it on)' AS expected,
       COALESCE((SELECT value::text FROM public.app_settings WHERE key = 'ai_writing_helper_enabled'), 'missing') AS actual,
       EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'ai_writing_helper_enabled') AS ok

UNION ALL
-- Member-facing functions: definer, search_path set, members yes, anon no.
SELECT format('%s: definer, search_path, members only', f.sig), 'definer, search_path=public, member yes, anon no, public no',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text
                 || ', config ' || COALESCE(array_to_string(p.proconfig, ' '), 'none')
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND p.prosecdef
         AND 'search_path=public' = ANY (p.proconfig)
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
         AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
FROM (VALUES
  ('public.get_listing_applicants(uuid)'),
  ('public.unshortlist_application(uuid)'),
  ('public.decline_application(uuid,text)'),
  ('public.mark_applications_seen(uuid[])'),
  ('public.remove_listing_dates(uuid)'),
  ('public.can_publish_listing()')
) AS f(sig)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'the old one-argument decline_application is gone (one-argument calls use the new default)', 'absent',
       CASE WHEN to_regprocedure('public.decline_application(uuid)') IS NULL THEN 'absent' ELSE 'present' END,
       to_regprocedure('public.decline_application(uuid)') IS NULL

UNION ALL
-- Internal helpers: nobody but the server can run them.
SELECT format('%s: server only', f.sig), 'member no, anon no',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL
         AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM (VALUES
  ('public.notify_application_status(uuid,text,uuid,text)'),
  ('public.scrub_contact_details(text)'),
  ('public.canonical_pet_type(text)')
) AS f(sig)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'get_listing_applicants returns no last names, emails or phones', 'no such columns',
       COALESCE(pg_get_function_result(to_regprocedure('public.get_listing_applicants(uuid)')), 'missing'),
       pg_get_function_result(to_regprocedure('public.get_listing_applicants(uuid)')) !~* '(last_name|email|phone|address|latitude|longitude)'

UNION ALL
SELECT 'applications.owner_seen_at exists', 'timestamptz',
       COALESCE((SELECT data_type FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'owner_seen_at'), 'missing'),
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'owner_seen_at')

UNION ALL
SELECT 'the application guard protects owner_seen_at', 'mentioned in guard_application_update',
       CASE WHEN p.oid IS NULL THEN 'missing' WHEN p.prosrc ILIKE '%owner_seen_at%' THEN 'yes' ELSE 'no' END,
       p.oid IS NOT NULL AND p.prosrc ILIKE '%owner_seen_at%'
FROM (SELECT 1) one
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.guard_application_update()')

UNION ALL
SELECT 'listing publish gate trigger is on listings', 'enabled, before insert or update of status',
       COALESCE((SELECT CASE t.tgenabled WHEN 'O' THEN 'enabled' ELSE 'state ' || t.tgenabled::text END
                 FROM pg_trigger t WHERE t.tgrelid = 'public.listings'::regclass
                   AND t.tgname = 'enforce_listing_publish_gate'), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.listings'::regclass
                 AND t.tgname = 'enforce_listing_publish_gate' AND t.tgenabled = 'O')

UNION ALL
SELECT 'the gate runs as the caller (so server jobs are never blocked)', 'invoker',
       CASE WHEN p.oid IS NULL THEN 'missing' WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END,
       p.oid IS NOT NULL AND NOT p.prosecdef
FROM (SELECT 1) one
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.enforce_listing_publish_gate()')

UNION ALL
-- Phones: members can't select any phone column.
SELECT format('members cannot read %s.%s', c.tbl, c.col), 'no SELECT for authenticated or anon',
       'member ' || has_column_privilege('authenticated', format('public.%I', c.tbl), c.col, 'SELECT')::text
         || ', anon ' || has_column_privilege('anon', format('public.%I', c.tbl), c.col, 'SELECT')::text,
       NOT has_column_privilege('authenticated', format('public.%I', c.tbl), c.col, 'SELECT')
         AND NOT has_column_privilege('anon', format('public.%I', c.tbl), c.col, 'SELECT')
FROM (VALUES ('profiles', 'phone_number'), ('sitter_profiles', 'phone'), ('owner_profiles', 'phone')) AS c(tbl, col)

UNION ALL
SELECT 'no view members can read has a phone column', 'none',
       COALESCE((SELECT string_agg(c.table_name || '.' || c.column_name, ', ')
                 FROM information_schema.columns c
                 JOIN information_schema.views v ON v.table_schema = c.table_schema AND v.table_name = c.table_name
                 WHERE c.table_schema = 'public' AND c.column_name ILIKE '%phone%'
                   AND c.column_name NOT IN ('phone_verified', 'phone_line_type')
                   AND has_table_privilege('authenticated', format('public.%I', c.table_name), 'SELECT')), 'none'),
       NOT EXISTS (SELECT 1
                   FROM information_schema.columns c
                   JOIN information_schema.views v ON v.table_schema = c.table_schema AND v.table_name = c.table_name
                   WHERE c.table_schema = 'public' AND c.column_name ILIKE '%phone%'
                     AND c.column_name NOT IN ('phone_verified', 'phone_line_type')
                     AND has_table_privilege('authenticated', format('public.%I', c.table_name), 'SELECT'))

UNION ALL
-- Every function that reads a phone column. ok = only the member's own
-- (get_my_contact_info), the write-only setter, or functions that check
-- is_admin first. Review each row.
SELECT format('reads a phone column: %s', p.oid::regprocedure::text),
       'only get_my_contact_info, set_my_profile_phone or admin',
       'member can run ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
         || CASE WHEN p.prosrc ~* 'is_admin' THEN ', checks is_admin' ELSE '' END,
       p.proname IN ('get_my_contact_info', 'set_my_profile_phone')
         OR p.prosrc ~* 'is_admin'
         OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosrc ~* '(phone_number|\.phone\M)'
  AND p.proname NOT IN ('scrub_contact_details');
