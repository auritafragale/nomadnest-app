-- Batch F1g: proof that the live database matches 20261015120000_batch_f1g.sql.
-- READ-ONLY. One row per check; every row should have ok = true.

SELECT format('perks.%s hidden from visitors and members', c.col) AS item, 'no SELECT for anon or authenticated' AS expected,
       format('anon %s, member %s',
              has_column_privilege('anon', 'public.perks', c.col, 'SELECT'),
              has_column_privilege('authenticated', 'public.perks', c.col, 'SELECT')) AS actual,
       NOT has_column_privilege('anon', 'public.perks', c.col, 'SELECT')
         AND NOT has_column_privilege('authenticated', 'public.perks', c.col, 'SELECT') AS ok
FROM (VALUES ('discount_code'), ('affiliate_url'), ('subid_param')) AS c(col)

UNION ALL
SELECT 'perks: no table-level SELECT for visitors or members', 'false / false',
       has_table_privilege('anon', 'public.perks', 'SELECT')::text || ' / ' || has_table_privilege('authenticated', 'public.perks', 'SELECT')::text,
       NOT has_table_privilege('anon', 'public.perks', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.perks', 'SELECT')

UNION ALL
SELECT 'perks: the public columns are still readable', 'every other column, visitors and members',
       COALESCE(string_agg(column_name, ', ' ORDER BY column_name)
                  FILTER (WHERE NOT (has_column_privilege('anon', 'public.perks', column_name, 'SELECT')
                                     AND has_column_privilege('authenticated', 'public.perks', column_name, 'SELECT'))), 'all readable'),
       bool_and(has_column_privilege('anon', 'public.perks', column_name, 'SELECT')
                AND has_column_privilege('authenticated', 'public.perks', column_name, 'SELECT'))
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'perks' AND column_name NOT IN ('discount_code', 'affiliate_url', 'subid_param')

UNION ALL
SELECT 'get_perk_discount_code: has_side_access on either side', 'definer, search_path=public, members yes, visitors no; no is_active_member',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('definer %s, %s, member %s, visitor %s, sitter %s, owner %s, is_active_member %s', p.prosecdef,
                        COALESCE(array_to_string(p.proconfig, ','), 'no config'),
                        has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE'),
                        position('has_side_access(auth.uid(), ''sitter'')' IN p.prosrc) > 0,
                        position('has_side_access(auth.uid(), ''owner'')' IN p.prosrc) > 0,
                        position('is_active_member' IN p.prosrc) > 0) END,
       p.oid IS NOT NULL AND p.prosecdef AND COALESCE(array_to_string(p.proconfig, ','), '') ~ 'search_path=public'
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
         AND position('has_side_access(auth.uid(), ''sitter'')' IN p.prosrc) > 0
         AND position('has_side_access(auth.uid(), ''owner'')' IN p.prosrc) > 0
         AND position('is_active_member' IN p.prosrc) = 0
FROM (SELECT 1) one
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.get_perk_discount_code(text)')

UNION ALL
SELECT 'city_chat_rooms: members can''t create rooms', 'no INSERT or ALL policy',
       COALESCE((SELECT string_agg(policyname, ', ') FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'city_chat_rooms' AND cmd IN ('INSERT', 'ALL')), 'none'),
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'city_chat_rooms' AND cmd IN ('INSERT', 'ALL'))

UNION ALL
SELECT 'city_chat_rooms: members still read room names', 'SELECT policy "Authenticated users can view all rooms"',
       COALESCE((SELECT cmd || ' ' || roles::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'city_chat_rooms'
                 AND policyname = 'Authenticated users can view all rooms'), 'missing'),
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'city_chat_rooms'
               AND policyname = 'Authenticated users can view all rooms' AND cmd = 'SELECT')

UNION ALL
SELECT 'rooms come from ensure_city_chat_room_for_sit', 'definer function, enabled trigger on sits',
       COALESCE((SELECT format('definer %s, trigger %s', p.prosecdef, tg.tgenabled) FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
                 WHERE tg.tgrelid = 'public.sits'::regclass AND p.proname = 'ensure_city_chat_room_for_sit' LIMIT 1), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
               WHERE tg.tgrelid = 'public.sits'::regclass AND p.proname = 'ensure_city_chat_room_for_sit'
                 AND p.prosecdef AND tg.tgenabled = 'O')

ORDER BY ok, item;
