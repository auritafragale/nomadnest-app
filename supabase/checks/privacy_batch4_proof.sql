-- Privacy batch 4: proof that the live database matches the final definition.
-- READ-ONLY. One row per object; every row should have ok = true.
-- Run after 20260927120000_privacy_batch4_reconcile.sql.

WITH
fk(tbl, col) AS (VALUES
  ('sits', 'owner_user_id'), ('sits', 'sitter_user_id'), ('sits', 'listing_id'), ('sits', 'sit_dates_id'),
  ('conversations', 'owner_user_id'), ('conversations', 'sitter_user_id'), ('conversations', 'pair_thread_id'),
  ('messages', 'sender_user_id'),
  ('reviews', 'reviewer_user_id'), ('reviews', 'reviewee_user_id'), ('reviews', 'sit_id'),
  ('reports', 'reporter_user_id'),
  ('community_flags', 'sit_id'), ('community_flags', 'review_id'),
  ('guide_questions', 'listing_id')
),
nullable(tbl, col) AS (
  SELECT tbl, col FROM fk
  UNION ALL VALUES
  ('community_flags', 'reporter_user_id'), ('guide_questions', 'sitter_user_id'), ('sit_checkins', 'author_user_id'),
  ('manual_id_verifications', 'id_photo_path'), ('manual_id_verifications', 'selfie_path')
),
new_cols(tbl, col, typ) AS (VALUES
  ('sits', 'snapshot_title', 'text'), ('sits', 'snapshot_city', 'text'), ('sits', 'snapshot_country', 'text'),
  ('sits', 'snapshot_start_date', 'date'), ('sits', 'snapshot_end_date', 'date'),
  ('reviews', 'former_reviewee_user_id', 'uuid'),
  ('manual_id_verifications', 'documents_deleted_at', 'timestamp with time zone'),
  ('messages', 'attachment_path', 'text')
),
ledger AS (
  SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || COALESCE(column_default, '-'), ', ' ORDER BY column_name) AS shape
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deleted_accounts'
),
fn(name, marker) AS (VALUES
  ('account_storage_objects', 'my_update_photos'),
  ('prepare_account_deletion', 'snapshot_title'),
  ('prepare_account_deletion', 'request.jwt.claim.sub'),
  ('purge_expired_safety_records', 'former_reviewee_user_id'),
  ('export_account_data', 'reviews_received'),
  ('export_account_files', 'report-evidence'),
  ('expired_id_documents', '30 days'),
  ('mark_id_documents_deleted', 'documents_deleted_at'),
  ('request_privacy_retention', 'privacy-retention'),
  ('admin_decide_id_verification', 'is_admin_user'),
  ('get_sit_update_context', 'other_member_left'),
  ('merge_orphaned_listing_conversation', 'NEW.owner_user_id IS NULL'),
  ('toggle_checkin_heart', 'c.sitter_user_id IS NOT NULL')
),
service_only(name) AS (VALUES
  ('account_storage_objects'), ('prepare_account_deletion'), ('export_account_data'), ('export_account_files'),
  ('expired_id_documents'), ('mark_id_documents_deleted'), ('purge_expired_safety_records'), ('request_privacy_retention')
)
SELECT 'deleted_accounts shape' AS object,
       'billing_records_retained:boolean:NO:true, deleted_at:timestamp with time zone:NO:now(), listing_ids:ARRAY:NO:''{}''::uuid[], notes:text:YES:-, onfido_applicant_deleted:boolean:YES:-, safety_purge_after:timestamp with time zone:NO:(now() + ''2 years''::interval), safety_purged_at:timestamp with time zone:YES:-, storage_files_deleted:integer:YES:-, stripe_subscriptions_cancelled:integer:YES:-, user_id:uuid:NO:-' AS expected,
       shape AS actual,
       shape = 'billing_records_retained:boolean:NO:true, deleted_at:timestamp with time zone:NO:now(), listing_ids:ARRAY:NO:''{}''::uuid[], notes:text:YES:-, onfido_applicant_deleted:boolean:YES:-, safety_purge_after:timestamp with time zone:NO:(now() + ''2 years''::interval), safety_purged_at:timestamp with time zone:YES:-, storage_files_deleted:integer:YES:-, stripe_subscriptions_cancelled:integer:YES:-, user_id:uuid:NO:-' AS ok
FROM ledger

UNION ALL
SELECT 'deleted_accounts RLS + admin policy', 'RLS on, admin-only SELECT',
       (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.deleted_accounts'::regclass) || ' / ' ||
       COALESCE((SELECT qual FROM pg_policies WHERE tablename = 'deleted_accounts' AND policyname = 'Admins can view deleted accounts'), 'missing'),
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.deleted_accounts'::regclass)
       AND EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deleted_accounts' AND policyname = 'Admins can view deleted accounts' AND qual LIKE '%is_admin_user%')

UNION ALL
SELECT 'FK ' || fk.tbl || '.' || fk.col, 'ON DELETE SET NULL',
       COALESCE(string_agg(CASE con.confdeltype WHEN 'n' THEN 'SET NULL' WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION' ELSE con.confdeltype::text END, ','), 'no FK'),
       COALESCE(bool_and(con.confdeltype = 'n'), false)
FROM fk
LEFT JOIN pg_attribute att ON att.attrelid = format('public.%I', fk.tbl)::regclass AND att.attname = fk.col
LEFT JOIN pg_constraint con ON con.conrelid = att.attrelid AND con.contype = 'f' AND con.conkey = ARRAY[att.attnum]
GROUP BY fk.tbl, fk.col

UNION ALL
SELECT 'nullable ' || n.tbl || '.' || n.col, 'YES', COALESCE(c.is_nullable, 'missing'), COALESCE(c.is_nullable = 'YES', false)
FROM nullable n
LEFT JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = n.tbl AND c.column_name = n.col

UNION ALL
SELECT 'column ' || n.tbl || '.' || n.col, n.typ, COALESCE(c.data_type, 'missing'), COALESCE(c.data_type = n.typ, false)
FROM new_cols n
LEFT JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = n.tbl AND c.column_name = n.col

UNION ALL
SELECT 'index ' || i.name, 'unique, only while both members exist',
       COALESCE(pg_get_indexdef(to_regclass('public.' || i.name)), 'missing'),
       COALESCE(pg_get_indexdef(to_regclass('public.' || i.name)) LIKE '%owner_user_id IS NOT NULL%sitter_user_id IS NOT NULL%', false)
FROM (VALUES ('conversations_unique_listing_pair'), ('conversations_unique_direct_pair')) AS i(name)

UNION ALL
SELECT 'policy reviews "' || p.name || '"', p.expected,
       COALESCE((SELECT roles::text || ' ' || qual FROM pg_policies WHERE tablename = 'reviews' AND policyname = p.name), 'missing'),
       COALESCE((SELECT qual LIKE p.expected FROM pg_policies WHERE tablename = 'reviews' AND policyname = p.name), false)
FROM (VALUES ('Anyone can view reviews of current members', '%reviewee_user_id IS NOT NULL%'),
             ('Admins can view all reviews', '%is_admin_user%')) AS p(name, expected)

UNION ALL
SELECT 'policy reviews "Anyone can view reviews" removed', 'absent',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'Anyone can view reviews') THEN 'present' ELSE 'absent' END,
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'Anyone can view reviews')

UNION ALL
SELECT 'policy messages "No messages to a member who left"', 'RESTRICTIVE INSERT',
       COALESCE((SELECT permissive || ' ' || cmd FROM pg_policies WHERE tablename = 'messages' AND policyname = 'No messages to a member who left'), 'missing'),
       EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'No messages to a member who left'
               AND permissive = 'RESTRICTIVE' AND cmd = 'INSERT' AND with_check LIKE '%owner_user_id IS NOT NULL%')

UNION ALL
SELECT 'function ' || f.name || ' contains "' || f.marker || '"', 'final version',
       CASE WHEN p.oid IS NULL THEN 'missing' WHEN position(f.marker IN p.prosrc) > 0 THEN 'final version' ELSE 'OLD version' END,
       p.oid IS NOT NULL AND position(f.marker IN p.prosrc) > 0
FROM fn f
LEFT JOIN pg_proc p ON p.proname = f.name AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT 'grant ' || s.name, 'service_role only',
       'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
         || ' service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE'),
       NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND (s.name = 'request_privacy_retention' OR has_function_privilege('service_role', p.oid, 'EXECUTE'))
FROM service_only s
JOIN pg_proc p ON p.proname = s.name AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT 'grant admin_decide_id_verification', 'authenticated yes, anon no',
       'anon=' || has_function_privilege('anon', 'public.admin_decide_id_verification(uuid,text,text)', 'EXECUTE')
         || ' authenticated=' || has_function_privilege('authenticated', 'public.admin_decide_id_verification(uuid,text,text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.admin_decide_id_verification(uuid,text,text)', 'EXECUTE')
         AND NOT has_function_privilege('anon', 'public.admin_decide_id_verification(uuid,text,text)', 'EXECUTE')

UNION ALL
SELECT 'cron privacy-retention', '15 3 * * * -> request_privacy_retention()',
       COALESCE((SELECT string_agg(schedule || ' -> ' || command, ' | ') FROM cron.job WHERE jobname = 'privacy-retention'), 'missing'),
       (SELECT count(*) = 1 AND bool_and(schedule = '15 3 * * *' AND command LIKE '%request_privacy_retention%')
        FROM cron.job WHERE jobname = 'privacy-retention')

ORDER BY ok, object;
