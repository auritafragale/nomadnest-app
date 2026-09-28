-- Dashboard, report evidence, guide photo paths and conversation ordering:
-- proof that the live database matches 20260928090000_dashboard_reports_chat.sql.
-- READ-ONLY. One row per check; every row should have ok = true.

WITH
fn(name, marker) AS (VALUES
  ('get_my_dashboard_summary', 'sit_update_due'),
  ('get_my_dashboard_summary', 'reviews_due'),
  ('get_my_sit_stories', 'portfolio_status'),
  ('attach_report_evidence', 'report-evidence'),
  ('attach_report_evidence', '''pending'''),
  ('guide_photo_object_ok', 'welcome-guide-photos'),
  ('bump_conversation_on_message', 'UPDATE public.conversations')
),
member_fn(name) AS (VALUES
  ('get_my_dashboard_summary'), ('get_my_sit_stories'), ('attach_report_evidence'), ('guide_photo_object_ok')
),
policy(name, cmd) AS (VALUES
  ('Owners read their guide photo rows', 'SELECT'),
  ('Owners add guide photos', 'INSERT'),
  ('Owners edit their guide photo rows', 'UPDATE'),
  ('Owners delete their guide photo rows', 'DELETE')
),
report_cols AS (
  SELECT c.column_name,
         has_column_privilege('authenticated', 'public.reports', c.column_name, 'INSERT') AS can_insert,
         has_column_privilege('authenticated', 'public.reports', c.column_name, 'UPDATE') AS can_update
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'reports'
)

SELECT format('function %s has %s', f.name, f.marker) AS item, 'present' AS expected,
       CASE WHEN p.oid IS NULL THEN 'missing'
            WHEN position(f.marker IN pg_get_functiondef(p.oid)) > 0 THEN 'present' ELSE 'marker missing' END AS actual,
       p.oid IS NOT NULL AND position(f.marker IN pg_get_functiondef(p.oid)) > 0 AS ok
FROM fn f
LEFT JOIN pg_proc p ON p.proname = f.name AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT format('function %s: members yes, anon no', p.proname), 'true / false',
       has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || ' / ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM pg_proc p JOIN member_fn m ON m.name = p.proname
WHERE p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT 'bump_conversation_on_message: trigger only', 'no member or anon execute',
       has_function_privilege('authenticated', 'public.bump_conversation_on_message()', 'EXECUTE')::text || ' / ' ||
       has_function_privilege('anon', 'public.bump_conversation_on_message()', 'EXECUTE')::text,
       NOT has_function_privilege('authenticated', 'public.bump_conversation_on_message()', 'EXECUTE')
         AND NOT has_function_privilege('anon', 'public.bump_conversation_on_message()', 'EXECUTE')

UNION ALL
SELECT 'trigger bump_conversation_on_message on messages', 'enabled, AFTER INSERT',
       COALESCE((SELECT tgenabled::text FROM pg_trigger
                 WHERE tgrelid = 'public.messages'::regclass AND tgname = 'bump_conversation_on_message'), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgrelid = 'public.messages'::regclass AND tgname = 'bump_conversation_on_message' AND tgenabled <> 'D')

UNION ALL
SELECT 'reports: no table-level INSERT/UPDATE (member / anon)', 'false false / false false',
       has_table_privilege('authenticated', 'public.reports', 'INSERT')::text || ' ' ||
       has_table_privilege('authenticated', 'public.reports', 'UPDATE')::text || ' / ' ||
       has_table_privilege('anon', 'public.reports', 'INSERT')::text || ' ' ||
       has_table_privilege('anon', 'public.reports', 'UPDATE')::text,
       NOT has_table_privilege('authenticated', 'public.reports', 'INSERT')
         AND NOT has_table_privilege('authenticated', 'public.reports', 'UPDATE')
         AND NOT has_table_privilege('anon', 'public.reports', 'INSERT')
         AND NOT has_table_privilege('anon', 'public.reports', 'UPDATE')

UNION ALL
SELECT 'reports: member INSERT columns', 'details, reason, reporter_user_id, target_id, target_type',
       COALESCE(string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE can_insert), '(none)'),
       COALESCE(string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE can_insert), '(none)')
         = 'details, reason, reporter_user_id, target_id, target_type'
FROM report_cols

UNION ALL
SELECT 'reports: member UPDATE columns', '(none)',
       COALESCE(string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE can_update), '(none)'),
       NOT bool_or(can_update)
FROM report_cols

UNION ALL
SELECT 'reports: uploaded proof recorded (backfill)', '0 reports with files but no paths',
       count(*)::text || ' reports',
       count(*) = 0
FROM public.reports r
WHERE cardinality(COALESCE(r.evidence_paths, '{}')) = 0
  AND EXISTS (SELECT 1 FROM storage.objects o
              WHERE o.bucket_id = 'report-evidence'
                AND o.name LIKE r.reporter_user_id::text || '/' || r.id::text || '/%')

UNION ALL
SELECT format('welcome_guide_photos policy "%s"', pol.name), pol.cmd,
       COALESCE((SELECT cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'welcome_guide_photos' AND policyname = pol.name), 'missing'),
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'welcome_guide_photos' AND policyname = pol.name AND cmd = pol.cmd)
FROM policy pol

UNION ALL
SELECT 'welcome_guide_photos: insert checks the file', 'guide_photo_object_ok in WITH CHECK',
       COALESCE((SELECT with_check FROM pg_policies WHERE tablename = 'welcome_guide_photos' AND policyname = 'Owners add guide photos'), 'missing'),
       COALESCE((SELECT position('guide_photo_object_ok' IN with_check) > 0 FROM pg_policies
                 WHERE tablename = 'welcome_guide_photos' AND policyname = 'Owners add guide photos'), false)

UNION ALL
SELECT 'welcome_guide_photos: old FOR ALL policy gone', 'absent',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'welcome_guide_photos' AND policyname = 'Owners manage their guide photos')
            THEN 'still there' ELSE 'absent' END,
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'welcome_guide_photos' AND policyname = 'Owners manage their guide photos')

UNION ALL
SELECT 'welcome_guide_photos: existing rows inside their folder', '0 outside',
       count(*)::text || ' outside',
       count(*) = 0
FROM public.welcome_guide_photos w
WHERE w.storage_path NOT LIKE w.owner_user_id::text || '/' || w.listing_id::text || '/%'

ORDER BY ok, item;
