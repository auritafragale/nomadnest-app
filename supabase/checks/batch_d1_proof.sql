-- Batch D1: proof that the live database matches
-- 20261005090000_batch_d1.sql (or Lovable's copy of it).
-- READ-ONLY. One row per check; every row should have ok = true.

WITH fns(sig) AS (VALUES
  ('public.get_conversation_partners()'),
  ('public.mark_conversation_notifications_read(uuid[])'),
  ('public.share_my_phone(uuid)'),
  ('public.stop_sharing_my_phone(uuid)'),
  ('public.get_phone_shares(uuid)'),
  ('public.mark_city_chat_room_read(uuid)'),
  ('public.get_my_city_chat_rooms()'),
  ('public.get_city_chat_catchup_input(uuid,timestamp with time zone)')
)
SELECT format('member function %s', f.sig) AS item,
       'definer, search_path=public, member yes, anon no' AS expected,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text
                 || ', search_path ' || COALESCE(array_to_string(p.proconfig, ','), 'none')
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END AS actual,
       p.oid IS NOT NULL AND p.prosecdef
         AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS ok
FROM fns f
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT format('server-only function %s', f.sig), 'member no, anon no',
       CASE WHEN to_regprocedure(f.sig) IS NULL THEN 'missing'
            ELSE 'member ' || has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE')::text END,
       to_regprocedure(f.sig) IS NOT NULL
         AND NOT has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE')
         AND NOT has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE')
FROM (VALUES ('public.live_sit_between(uuid,uuid)'), ('public.phone_share_conversation(uuid,uuid,uuid)'),
             ('public.end_phone_shares_on_cancel()')) AS f(sig)

UNION ALL
SELECT 'phone_shares: RLS on, no access for members', 'rls on, no SELECT/INSERT/UPDATE/DELETE',
       CASE WHEN to_regclass('public.phone_shares') IS NULL THEN 'missing'
            ELSE 'rls ' || c.relrowsecurity::text
                 || ', member any ' || has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')::text
                 || ', anon any ' || has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')::text END,
       c.oid IS NOT NULL AND c.relrowsecurity
         AND NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
         AND NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
FROM (SELECT 1) one LEFT JOIN pg_class c ON c.oid = to_regclass('public.phone_shares')

UNION ALL
SELECT format('%s: RLS on, own rows only', t.name), 'rls on, every policy checks auth.uid()',
       CASE WHEN c.oid IS NULL THEN 'missing'
            ELSE 'rls ' || c.relrowsecurity::text || ', policies ' || (SELECT count(*) FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = t.name)::text
                 || ', not own ' || (SELECT count(*) FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = t.name
                                      AND COALESCE(pp.qual, '') || COALESCE(pp.with_check, '') !~ 'auth\.uid\(\)')::text END,
       c.oid IS NOT NULL AND c.relrowsecurity
         AND EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = t.name)
         AND NOT EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = t.name
                         AND COALESCE(pp.qual, '') || COALESCE(pp.with_check, '') !~ 'auth\.uid\(\)')
         AND NOT has_table_privilege('anon', c.oid, 'SELECT')
FROM (VALUES ('city_chat_mutes'), ('city_chat_room_reads')) AS t(name)
LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || t.name)

UNION ALL
SELECT 'city_chat_room_reads: written only through mark_city_chat_room_read', 'no INSERT/UPDATE for members',
       CASE WHEN to_regclass('public.city_chat_room_reads') IS NULL THEN 'missing'
            ELSE 'member write ' || has_table_privilege('authenticated', 'public.city_chat_room_reads', 'INSERT,UPDATE,DELETE')::text END,
       to_regclass('public.city_chat_room_reads') IS NOT NULL
         AND NOT has_table_privilege('authenticated', 'public.city_chat_room_reads', 'INSERT,UPDATE,DELETE')

UNION ALL
SELECT 'trigger end_phone_shares_on_cancel', 'enabled on sits',
       COALESCE((SELECT CASE tg.tgenabled WHEN 'O' THEN 'enabled' ELSE 'state ' || tg.tgenabled::text END
                 FROM pg_trigger tg WHERE tg.tgrelid = 'public.sits'::regclass AND tg.tgname = 'end_phone_shares_on_cancel'), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = 'public.sits'::regclass AND tg.tgname = 'end_phone_shares_on_cancel' AND tg.tgenabled = 'O')

UNION ALL
SELECT 'share_my_phone writes no number and sends no email', 'marker without number, no email call',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'marker ' || (p.prosrc ~ '\[\[phone_share\]\]\{"action":"shared"\}')::text
                 || ', number into messages/notifications ' || (p.prosrc ~* 'phone_number[^;]*(INSERT|VALUES)|v_number\s*\|\|')::text
                 || ', email ' || (p.prosrc ~* 'send-notification-email|email')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ '\[\[phone_share\]\]\{"action":"shared"\}'
         AND p.prosrc !~* 'v_number\s*\|\|' AND p.prosrc !~* 'send-notification-email'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.share_my_phone(uuid)')

UNION ALL
SELECT 'no message or notification holds a phone number next to a share', '0 share markers with digits, 0 phone_shared rows with digits',
       (SELECT count(*) FROM public.messages WHERE body LIKE '[[phone_share]]%' AND body ~ '\d{6}')::text || ' markers, '
         || (SELECT count(*) FROM public.notifications WHERE type = 'phone_shared'
               AND (title || message || COALESCE(data::text, '')) ~ '\+?\d[\d\s().-]{7,}\d')::text || ' notifications',
       NOT EXISTS (SELECT 1 FROM public.messages WHERE body LIKE '[[phone_share]]%' AND body ~ '\d{6}')
         AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE type = 'phone_shared'
                         AND (title || message || COALESCE(data::text, '')) ~ '\+?\d[\d\s().-]{7,}\d')

UNION ALL
SELECT 'get_conversation_partners never reads last names, emails or phones', 'no last_name/email/phone in body',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~* 'last_name|email|phone')::text END,
       p.oid IS NOT NULL AND p.prosrc !~* 'last_name|email|phone'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.get_conversation_partners()')

UNION ALL
SELECT 'can_access_city_chat matches city AND country', 'uses city_chat_key(l.city, l.country)',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ 'city_chat_key\(l\.city, l\.country\)')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ 'city_chat_key\(l\.city, l\.country\)'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.can_access_city_chat(uuid,uuid)')

UNION ALL
SELECT 'city_chat_messages: members read only rooms they can access', 'a SELECT policy using can_access_city_chat',
       COALESCE((SELECT string_agg(pp.policyname, ', ') FROM pg_policies pp
                 WHERE pp.schemaname = 'public' AND pp.tablename = 'city_chat_messages' AND pp.cmd IN ('SELECT', 'ALL')), 'none'),
       EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = 'city_chat_messages'
               AND pp.cmd IN ('SELECT', 'ALL') AND pp.qual ~ 'can_access_city_chat')
         AND NOT EXISTS (SELECT 1 FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = 'city_chat_messages'
                         AND pp.cmd IN ('SELECT', 'ALL') AND COALESCE(pp.qual, '') !~ 'can_access_city_chat|is_admin_user')

UNION ALL
SELECT 'muted rooms send no push for thread replies', 'push trigger checks city_chat_mutes',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ 'city_chat_mutes')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ 'city_chat_mutes'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.push_on_notification_insert()')

UNION ALL
SELECT 'chat translation skips phone-share markers', 'queue_chat_translation mentions [[phone_share]]',
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (p.prosrc ~ '\[\[phone_share\]\]')::text END,
       p.oid IS NOT NULL AND p.prosrc ~ '\[\[phone_share\]\]'
FROM (SELECT 1) one LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.queue_chat_translation()')

UNION ALL
SELECT 'report type city_chat_message exists', 'in report_target_type',
       COALESCE((SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) FROM pg_enum e
                 WHERE e.enumtypid = 'public.report_target_type'::regtype), 'missing'),
       EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = 'public.report_target_type'::regtype AND e.enumlabel = 'city_chat_message')

UNION ALL
SELECT 'admin_list_reports shows the reported message', 'returns reported_message, reported_sender_first_name; admins only',
       COALESCE(pg_get_function_result(to_regprocedure('public.admin_list_reports()')), 'missing'),
       COALESCE(pg_get_function_result(to_regprocedure('public.admin_list_reports()')) ~ 'reported_message text, reported_sender_first_name text', false)
         AND (SELECT p.prosrc ~ 'is_admin_user\(auth\.uid\(\)\)' FROM pg_proc p WHERE p.oid = to_regprocedure('public.admin_list_reports()'))

UNION ALL
SELECT 'flag ai_city_catchup_enabled', 'exists (false until switched on)',
       COALESCE((SELECT value::text FROM public.app_settings WHERE key = 'ai_city_catchup_enabled'), 'missing'),
       EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'ai_city_catchup_enabled');
