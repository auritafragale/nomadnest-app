-- Batch F1d: proof that the live database matches
-- 20261014200000_batch_f1d.sql (or Lovable's copy of it), plus the ID bucket
-- file types Lovable sets through its Storage step.
-- READ-ONLY. One row per check; every row should have ok = true.
-- Run it in the SQL editor as is: the editor sends no member token, which is
-- exactly the "no token" case the first row checks.

SELECT 'request_is_end_user() with no token' AS item, 'false (not NULL)' AS expected,
       COALESCE(public.request_is_end_user()::text, 'NULL') AS actual,
       public.request_is_end_user() IS FALSE AS ok

UNION ALL
SELECT 'request_is_end_user(): shape', 'sql, STABLE, definer, search_path=public, COALESCE(..., false)',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('%s, volatile %s, definer %s, %s, coalesce-false %s', l.lanname, p.provolatile, p.prosecdef,
                        COALESCE(array_to_string(p.proconfig, ','), 'no config'), (p.prosrc ~* 'false\s*\)\s*;?\s*$')) END,
       p.oid IS NOT NULL AND l.lanname = 'sql' AND p.provolatile = 's' AND p.prosecdef
         AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND p.prosrc ~* 'COALESCE' AND p.prosrc ~* 'false\s*\)\s*;?\s*$'
         AND p.prosrc ~ '''authenticated'''
FROM (SELECT 1) one
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.request_is_end_user()')
LEFT JOIN pg_language l ON l.oid = p.prolang

UNION ALL
SELECT 'request_is_end_user(): same grants', 'no member or visitor execute',
       CASE WHEN to_regprocedure('public.request_is_end_user()') IS NULL THEN 'missing'
            ELSE 'member ' || has_function_privilege('authenticated', 'public.request_is_end_user()', 'EXECUTE')::text
                 || ', visitor ' || has_function_privilege('anon', 'public.request_is_end_user()', 'EXECUTE')::text END,
       to_regprocedure('public.request_is_end_user()') IS NOT NULL
         AND NOT has_function_privilege('authenticated', 'public.request_is_end_user()', 'EXECUTE')
         AND NOT has_function_privilege('anon', 'public.request_is_end_user()', 'EXECUTE')

UNION ALL
-- Every function that calls it was reviewed for F1d. A new caller shows up
-- here as not ok until it is reviewed and added to the list.
SELECT 'callers of request_is_end_user()',
       'guard_manual_id_verification, guard_report_insert, guard_sitter_invite_update, guard_user_roles, prevent_privilege_escalation, require_nomad_access_to_apply, require_owner_access_to_invite, review_before_insert',
       COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), 'none'),
       COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), 'none')
         = 'guard_manual_id_verification, guard_report_insert, guard_sitter_invite_update, guard_user_roles, prevent_privilege_escalation, require_nomad_access_to_apply, require_owner_access_to_invite, review_before_insert'
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname <> 'request_is_end_user'
  AND p.prosrc ~ 'request_is_end_user'

UNION ALL
SELECT 'bucket id-verification-documents', 'private, 10MB, jpeg, png, webp, heic, heif, pdf only',
       COALESCE((SELECT format('public %s, %s bytes, %s', public, COALESCE(file_size_limit::text, 'no limit'),
                               COALESCE(array_to_string(allowed_mime_types, ', '), 'any type'))
                 FROM storage.buckets WHERE id = 'id-verification-documents'), 'missing'),
       EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'id-verification-documents'
                 AND NOT public AND file_size_limit = 10485760 AND allowed_mime_types IS NOT NULL
                 AND (SELECT array_agg(t ORDER BY t) FROM unnest(allowed_mime_types) t)
                     = ARRAY['application/pdf', 'image/heic', 'image/heif', 'image/jpeg', 'image/png', 'image/webp'])

ORDER BY ok, item;
