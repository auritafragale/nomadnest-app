-- Batch F1b: proof that the live database matches
-- 20261014150000_batch_f1b.sql (or Lovable's copy of it).
-- READ-ONLY. One row per check; every row should have ok = true.
-- pg_trigger.tgtype bits: 1 row, 4 insert, 8 delete, 16 update.

SELECT 'post_invite_note: definer, search_path=public, members only' AS item,
       'definer true, search_path=public, member true, visitor false' AS expected,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text || ', ' || COALESCE(array_to_string(p.proconfig, ','), 'no config')
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', visitor ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END AS actual,
       p.oid IS NOT NULL AND p.prosecdef
         AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AS ok
FROM (SELECT to_regprocedure('public.post_invite_note(uuid,uuid,uuid)') AS oid) x
LEFT JOIN pg_proc p ON p.oid = x.oid

UNION ALL
SELECT 'notify_new_message skips quiet messages', 'its body checks nn.quiet_message',
       CASE WHEN p.oid IS NULL THEN 'missing' WHEN p.prosrc ~ 'nn\.quiet_message' THEN 'checks it' ELSE 'does not check it' END,
       p.oid IS NOT NULL AND p.prosrc ~ 'nn\.quiet_message'
FROM (SELECT to_regprocedure('public.notify_new_message()') AS oid) x
LEFT JOIN pg_proc p ON p.oid = x.oid

UNION ALL
SELECT format('statement trigger %s on %s', t.trg, t.tbl), 'enabled, AFTER INSERT, FOR EACH STATEMENT, with a NEW TABLE, runs ' || t.fn,
       COALESCE((SELECT format('enabled %s, %s, insert %s, new table %s, runs %s',
                               tg.tgenabled, CASE WHEN tg.tgtype & 1 = 1 THEN 'row' ELSE 'statement' END,
                               (tg.tgtype & 4 = 4)::text, COALESCE(tg.tgnewtable::text, 'none'), p.proname)
                 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
                 WHERE tg.tgrelid = to_regclass('public.' || t.tbl) AND tg.tgname = t.trg), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
               WHERE tg.tgrelid = to_regclass('public.' || t.tbl) AND tg.tgname = t.trg
                 AND tg.tgenabled = 'O' AND tg.tgtype & 1 = 0 AND tg.tgtype & 4 = 4
                 AND tg.tgnewtable IS NOT NULL AND p.proname = t.fn)
FROM (VALUES
  ('notify_sitter_on_invite_batch', 'sitter_invites', 'notify_sitter_on_invite_batch'),
  ('notify_new_applications', 'applications', 'notify_new_applications_batch')
) AS t(trg, tbl, fn)

UNION ALL
SELECT 'the old invitation row trigger is gone', 'no trigger on sitter_invites runs notify_sitter_on_invite',
       COALESCE((SELECT string_agg(tg.tgname, ', ') FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
                 WHERE tg.tgrelid = 'public.sitter_invites'::regclass AND p.proname = 'notify_sitter_on_invite'), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
                   WHERE tg.tgrelid = 'public.sitter_invites'::regclass AND p.proname = 'notify_sitter_on_invite')

UNION ALL
SELECT 'notify_application_events fires on UPDATE only', 'enabled, row, update yes, insert no, delete no',
       COALESCE((SELECT format('enabled %s, %s, update %s, insert %s, delete %s', tg.tgenabled,
                               CASE WHEN tg.tgtype & 1 = 1 THEN 'row' ELSE 'statement' END,
                               (tg.tgtype & 16 = 16)::text, (tg.tgtype & 4 = 4)::text, (tg.tgtype & 8 = 8)::text)
                 FROM pg_trigger tg WHERE tg.tgrelid = 'public.applications'::regclass AND tg.tgname = 'notify_application_events'), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = 'public.applications'::regclass AND tg.tgname = 'notify_application_events'
                 AND tg.tgenabled = 'O' AND tg.tgtype & 1 = 1 AND tg.tgtype & 16 = 16 AND tg.tgtype & 4 = 0 AND tg.tgtype & 8 = 0)
       -- and nothing else on applications still runs it for inserts
       AND NOT EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = 'public.applications'::regclass
                         AND tg.tgfoid = to_regprocedure('public.notify_application_events()') AND tg.tgtype & 4 = 4)

UNION ALL
SELECT format('function %s', f.sig), 'definer, search_path=public, no member or visitor access',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text || ', ' || COALESCE(array_to_string(p.proconfig, ','), 'no config')
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', visitor ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND p.prosecdef
         AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM (VALUES
  ('public.notify_sitter_on_invite_batch()'),
  ('public.notify_new_applications_batch()'),
  ('public.notify_application_events()')
) AS f(sig)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig);
