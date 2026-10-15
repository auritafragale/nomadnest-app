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
SELECT 'bucket id-verification-documents: private, 10MB', 'private, 10485760 bytes',
       COALESCE((SELECT format('public %s, %s bytes', public, COALESCE(file_size_limit::text, 'no limit'))
                 FROM storage.buckets WHERE id = 'id-verification-documents'), 'missing'),
       EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'id-verification-documents'
                 AND NOT public AND file_size_limit = 10485760)

UNION ALL
-- Updated for F1f: Lovable can't set the bucket's file types, so the limit may
-- instead be the upload rule (allowed_mime_types null and the INSERT policy
-- requiring jpg, jpeg, png, webp, heic, heif or pdf). "actual" says which way
-- it passed.
SELECT 'bucket id-verification-documents: file types limited', 'by the bucket''s file types, or by the upload rule',
       COALESCE(t.way, 'not limited: ' || COALESCE((SELECT array_to_string(allowed_mime_types, ', ') FROM storage.buckets
                                                    WHERE id = 'id-verification-documents'), 'any type, and no extension rule')),
       t.way IS NOT NULL
FROM (
  SELECT (SELECT CASE
            WHEN b.allowed_mime_types IS NOT NULL
                 AND (SELECT array_agg(x ORDER BY x) FROM unnest(b.allowed_mime_types) x)
                     = ARRAY['application/pdf', 'image/heic', 'image/heif', 'image/jpeg', 'image/png', 'image/webp']
              THEN 'by the bucket''s file types'
            WHEN b.allowed_mime_types IS NULL
                 AND EXISTS (SELECT 1 FROM pg_policies p
                             WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'INSERT'
                               AND p.policyname = 'Users can upload own ID documents'
                               AND position('id-verification-documents' IN p.with_check) > 0
                               AND position('foldername(name)' IN p.with_check) > 0
                               AND position('lower(storage.extension(name))' IN p.with_check) > 0
                               AND (SELECT bool_and(position(quote_literal(e) IN p.with_check) > 0)
                                    FROM unnest(ARRAY['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf']) e))
                 -- and no other permissive policy lets members add files to this bucket
                 AND NOT EXISTS (SELECT 1 FROM pg_policies p
                                 WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('INSERT', 'ALL')
                                   AND p.permissive = 'PERMISSIVE' AND p.policyname <> 'Users can upload own ID documents'
                                   AND (position('id-verification-documents' IN COALESCE(p.with_check, p.qual, '')) > 0
                                        OR position('bucket_id = ''' IN COALESCE(p.with_check, p.qual, '')) = 0))
              THEN 'by the upload rule (file extensions)'
          END
          FROM storage.buckets b WHERE b.id = 'id-verification-documents') AS way
) t

ORDER BY ok, item;
