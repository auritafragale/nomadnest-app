-- Batch F1: proof that the live database matches
-- 20261014090000_batch_f1.sql (or Lovable's copy of it).
-- READ-ONLY. One row per check; every row should have ok = true.

SELECT 'notifications.dedupe_key exists' AS item, 'text column, may be empty' AS expected,
       COALESCE((SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
                 WHERE a.attrelid = 'public.notifications'::regclass AND a.attname = 'dedupe_key' AND NOT a.attisdropped), 'missing') AS actual,
       EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public.notifications'::regclass
               AND a.attname = 'dedupe_key' AND NOT a.attisdropped AND NOT a.attnotnull) AS ok

UNION ALL
SELECT 'one notification per member per event', 'unique index on (user_id, dedupe_key)',
       COALESCE((SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'notifications_user_dedupe_key'), 'missing'),
       EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
               WHERE c.relname = 'notifications_user_dedupe_key' AND i.indisunique AND i.indpred IS NULL)

UNION ALL
SELECT format('event %s: trigger %s on %s', x.type, x.trg, x.tbl), 'enabled, runs a server notify function',
       COALESCE((SELECT CASE tg.tgenabled WHEN 'O' THEN 'enabled, ' || p.proname ELSE 'state ' || tg.tgenabled::text END
                 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
                 WHERE tg.tgrelid = to_regclass('public.' || x.tbl) AND tg.tgname = x.trg), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
               WHERE tg.tgrelid = to_regclass('public.' || x.tbl) AND tg.tgname = x.trg AND tg.tgenabled = 'O'
                 AND p.prosrc ~ 'notify_member')
FROM (VALUES
  ('new_application', 'notify_application_events', 'applications'),
  ('application_withdrawn', 'notify_application_events', 'applications'),
  ('invite', 'notify_sitter_on_invite', 'sitter_invites'),
  ('sit_cancelled', 'notify_sit_cancelled', 'sits'),
  ('listing_dates_changed', 'notify_listing_dates_changed', 'sit_dates'),
  ('sit_reschedule_proposed / accepted / declined', 'notify_sit_reschedule', 'sit_reschedule_requests'),
  ('sit_checkin', 'trg_notify_owner_on_sit_checkin', 'sit_checkins'),
  ('id_verification_approved / rejected', 'notify_id_verification_decision', 'manual_id_verifications'),
  ('new_report (founders)', 'notify_new_report', 'reports')
) AS x(type, trg, tbl)

UNION ALL
SELECT format('function %s', f.sig), 'definer, search_path=public, no member or visitor access',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text || ', ' || COALESCE(array_to_string(p.proconfig, ','), 'no config')
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND (p.prosecdef OR f.sig ~ 'nn_date_range')
         AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM (VALUES
  ('public.notify_member(uuid,text,text,text,text,jsonb,text,text,boolean)'),
  ('public.nn_date_range(date,date)'),
  ('public.nn_first_name(uuid,text)'),
  ('public.nn_listing_place(uuid)'),
  ('public.notify_application_events()'),
  ('public.notify_sitter_on_invite()'),
  ('public.notify_sit_cancelled()'),
  ('public.notify_listing_dates_changed()'),
  ('public.notify_sit_reschedule()'),
  ('public.notify_owner_on_sit_checkin()'),
  ('public.notify_id_verification_decision()'),
  ('public.notify_new_report()'),
  ('public.notify_application_status(uuid,text,uuid,text)'),
  ('public.notify_city_chat_thread_subscribers()'),
  ('public.cancel_sits_on_block()')
) AS f(sig)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT format('no member text: %s', x.what), x.expect,
       CASE WHEN p.oid IS NULL THEN 'missing' ELSE (NOT (p.prosrc ~ x.pattern))::text END,
       p.oid IS NOT NULL AND NOT (p.prosrc ~ x.pattern)
FROM (VALUES
  ('daily update note', 'notify_owner_on_sit_checkin never uses note or flag_note', 'public.notify_owner_on_sit_checkin()', 'NEW\.(note|flag_note)'),
  ('decline note', 'notify_application_status never puts p_note in the words or the email', 'public.notify_application_status(uuid,text,uuid,text)', '\|\|\s*p_note|''note'',\s*COALESCE\(p_note'),
  ('City Chat reply', 'notify_city_chat_thread_subscribers never quotes the reply', 'public.notify_city_chat_thread_subscribers()', 'LEFT\(NEW\.content|LEFT\(m\.content'),
  ('invitation message', 'notify_sitter_on_invite never uses the invitation message', 'public.notify_sitter_on_invite()', 'NEW\.message'),
  ('application message', 'notify_application_events never uses the application message', 'public.notify_application_events()', 'NEW\.message'),
  ('reschedule note', 'notify_sit_reschedule never uses the note', 'public.notify_sit_reschedule()', 'NEW\.note'),
  ('report details', 'notify_new_report never uses the details', 'public.notify_new_report()', 'NEW\.details'),
  ('block cancellation', 'cancel_sits_on_block no longer sends its own notice', 'public.cancel_sits_on_block()', 'request_internal_function')
) AS x(what, expect, sig, pattern)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(x.sig)

-- The browser path: send-notification-email now answers a member's call with
-- { skipped: true } (checked in the function, not visible from SQL). From the
-- database side, no notification of a moved type may appear without a
-- dedupe key once the first server-sent one exists (that would be an old
-- browser send getting through).
UNION ALL
SELECT 'no browser-sent notifications since F1 went live', '0 moved-type rows without dedupe_key after the first server-sent one',
       COALESCE((SELECT count(*)::text FROM public.notifications n
                 WHERE n.dedupe_key IS NULL
                   AND n.type IN ('new_application', 'application_withdrawn', 'invite', 'sit_cancelled', 'listing_dates_changed',
                                  'sit_reschedule_proposed', 'sit_reschedule_accepted', 'sit_reschedule_declined', 'sit_checkin',
                                  'id_verification_approved', 'id_verification_rejected')
                   AND n.created_at > (SELECT min(created_at) FROM public.notifications WHERE dedupe_key IS NOT NULL)), '0'),
       NOT EXISTS (SELECT 1 FROM public.notifications n
                   WHERE n.dedupe_key IS NULL
                     AND n.type IN ('new_application', 'application_withdrawn', 'invite', 'sit_cancelled', 'listing_dates_changed',
                                    'sit_reschedule_proposed', 'sit_reschedule_accepted', 'sit_reschedule_declined', 'sit_checkin',
                                    'id_verification_approved', 'id_verification_rejected')
                     AND n.created_at > (SELECT min(created_at) FROM public.notifications WHERE dedupe_key IS NOT NULL));
