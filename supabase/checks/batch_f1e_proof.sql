-- Batch F1e: proof that the live database matches
-- 20261014220000_batch_f1e.sql and that the one-time repair
-- (20261014220100_batch_f1e_repair.sql) left nothing behind.
-- READ-ONLY. One row per check; every row should have ok = true.

SELECT 'respond_to_sit_reschedule moves the application and closes the old range' AS item,
       'updates applications and sitter_invites, calls close_moved_sit_dates' AS expected,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('applications %s, invites %s, close %s',
                        p.prosrc ~ 'UPDATE public\.applications SET sit_dates_id',
                        p.prosrc ~ 'UPDATE public\.sitter_invites SET sit_dates_id',
                        p.prosrc ~ 'close_moved_sit_dates') END AS actual,
       p.oid IS NOT NULL
         AND p.prosrc ~ 'UPDATE public\.applications SET sit_dates_id'
         AND p.prosrc ~ 'UPDATE public\.sitter_invites SET sit_dates_id'
         AND p.prosrc ~ 'close_moved_sit_dates' AS ok
FROM (SELECT 1) one
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.respond_to_sit_reschedule(uuid,boolean)')

UNION ALL
SELECT format('function %s', f.sig), f.expect,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'definer ' || p.prosecdef::text || ', ' || COALESCE(array_to_string(p.proconfig, ','), 'no config')
                 || ', member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 || ', visitor ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND p.prosecdef
         AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = f.member
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM (VALUES
  ('public.respond_to_sit_reschedule(uuid,boolean)', true, 'definer, search_path=public, members yes (as before), visitors no'),
  ('public.close_moved_sit_dates(uuid)', false, 'definer, search_path=public, no member or visitor access'),
  ('public.guard_sitter_invite_update()', false, 'definer, search_path=public, no member or visitor access')
) AS f(sig, member, expect)
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)

UNION ALL
SELECT 'close_moved_sit_dates deletes only unreferenced ranges, else closes', 'checks applications, invitations, sits, guide unlocks; sets closed',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('refs %s, closed %s', p.prosrc ~ 'applications' AND p.prosrc ~ 'sitter_invites' AND p.prosrc ~ 'public\.sits'
                                              AND p.prosrc ~ 'guide_unlock_notifications', p.prosrc ~ '''closed''') END,
       p.oid IS NOT NULL AND p.prosrc ~ 'applications' AND p.prosrc ~ 'sitter_invites' AND p.prosrc ~ 'public\.sits'
         AND p.prosrc ~ 'guide_unlock_notifications' AND p.prosrc ~ '''closed'''
FROM (SELECT 1) one
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.close_moved_sit_dates(uuid)')

UNION ALL
SELECT 'guard_sitter_invite_update: trusted move only, rules otherwise unchanged', 'app.trusted_invite_move flag; still checks applications',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('flag %s, rules %s', p.prosrc ~ 'app\.trusted_invite_move', p.prosrc ~ 'public\.applications' AND p.prosrc ~ 'request_is_end_user') END,
       p.oid IS NOT NULL AND p.prosrc ~ 'app\.trusted_invite_move'
         AND p.prosrc ~ 'public\.applications' AND p.prosrc ~ 'request_is_end_user'
FROM (SELECT 1) one
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.guard_sitter_invite_update()')

UNION ALL
-- After the repair: every accepted application has a sit of its Nomad on its
-- range (confirmed, in progress or completed). A sit that is cancelled
-- cancels its application.
SELECT 'no accepted application without a sit on its range', '0',
       count(*)::text || COALESCE(' (' || string_agg(a.id::text, ', ') || ')', ''),
       count(*) = 0
FROM public.applications a
WHERE a.status = 'accepted'
  AND NOT EXISTS (SELECT 1 FROM public.sits s
                  WHERE s.sit_dates_id = a.sit_dates_id AND s.sitter_user_id = a.sitter_user_id
                    AND s.status IN ('confirmed', 'in_progress', 'completed'))

UNION ALL
SELECT 'no live sit without its accepted application on its range', '0',
       count(*)::text || COALESCE(' (' || string_agg(s.id::text, ', ') || ')', ''),
       count(*) = 0
FROM public.sits s
WHERE s.status IN ('confirmed', 'in_progress') AND s.sit_dates_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.applications a
                  WHERE a.sit_dates_id = s.sit_dates_id AND a.sitter_user_id = s.sitter_user_id AND a.status = 'accepted')

UNION ALL
SELECT 'no open range left behind by a moved sit', '0 open ranges whose only accepted application has no sit',
       count(*)::text,
       count(*) = 0
FROM public.sit_dates sd
WHERE sd.status = 'open'
  AND EXISTS (SELECT 1 FROM public.applications a WHERE a.sit_dates_id = sd.id AND a.status = 'accepted')

ORDER BY ok, item;
