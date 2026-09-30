-- Stage 2 (Nomad screens): proof that the live database matches 20260928134135_45eeb6f4-e6cd-4676-8b37-525b0ff1dedf.sql (Nomad screens).
-- READ-ONLY. One row per check; every row should have ok = true.

WITH
member_tables(t) AS (VALUES
  ('arrival_vault_photos'), ('cancellation_strikes'), ('city_chat_message_reactions'), ('city_chat_messages'),
  ('city_chat_rooms'), ('city_chat_thread_subscriptions'), ('community_flags'), ('community_strike_notes'),
  ('community_strikes'), ('conversation_pair_threads'), ('conversations'), ('favorites'), ('founding_member_codes'),
  ('manual_id_verifications'), ('messages'), ('notification_preferences'), ('perk_clicks'), ('push_subscriptions'),
  ('reliability_review_notes'), ('reports'), ('review_flag_evidence'), ('review_reminders'), ('sit_checkins'),
  ('sit_reschedule_requests'), ('sitter_invites'), ('user_roles'), ('sitter_availability')
),
fn(name, definer) AS (VALUES
  ('accept_invite', false),
  ('set_my_availability', true),
  ('get_sitter_free_dates', true)
)

SELECT format('anon: no access to %s', m.t) AS item, 'no privileges' AS expected,
       CASE WHEN to_regclass('public.' || m.t) IS NULL THEN 'table missing'
            WHEN has_table_privilege('anon', format('public.%I', m.t), 'SELECT,INSERT,UPDATE,DELETE')
              OR has_any_column_privilege('anon', format('public.%I', m.t), 'SELECT,INSERT,UPDATE')
            THEN 'has privileges' ELSE 'no privileges' END AS actual,
       to_regclass('public.' || m.t) IS NOT NULL
         AND NOT has_table_privilege('anon', format('public.%I', m.t), 'SELECT,INSERT,UPDATE,DELETE')
         AND NOT has_any_column_privilege('anon', format('public.%I', m.t), 'SELECT,INSERT,UPDATE') AS ok
FROM member_tables m

UNION ALL
SELECT 'sitter_invites insert: own published listing, open date', 'listing owner + open sit_dates check',
       COALESCE((SELECT with_check FROM pg_policies WHERE tablename = 'sitter_invites' AND policyname = 'Owners can insert invites'), 'missing'),
       COALESCE((SELECT position('owner_user_id = auth.uid()' IN with_check) > 0 AND position('open' IN with_check) > 0
                   AND position('end_date >= CURRENT_DATE' IN with_check) > 0
                 FROM pg_policies WHERE tablename = 'sitter_invites' AND policyname = 'Owners can insert invites'), false)

UNION ALL
SELECT 'sitter_invites: 20 a day limit', 'trigger enabled',
       COALESCE((SELECT tgenabled::text FROM pg_trigger WHERE tgrelid = 'public.sitter_invites'::regclass AND tgname = 'limit_sitter_invites'), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sitter_invites'::regclass AND tgname = 'limit_sitter_invites' AND tgenabled <> 'D')
         AND position('>= 20' IN pg_get_functiondef('public.limit_sitter_invites()'::regprocedure)) > 0

UNION ALL
SELECT format('function %s: %s, members yes, anon no', f.name, CASE WHEN f.definer THEN 'definer' ELSE 'invoker' END),
       'as planned',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE (CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END) || ', member '
              || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || ', anon '
              || has_function_privilege('anon', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL AND p.prosecdef = f.definer
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM fn f LEFT JOIN pg_proc p ON p.proname = f.name AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT 'sitter_availability: RLS on, members read own rows only', 'RLS on, SELECT only, own-row policy',
       (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.sitter_availability'::regclass)
         || ', insert ' || has_table_privilege('authenticated', 'public.sitter_availability', 'INSERT')::text
         || ', update ' || has_table_privilege('authenticated', 'public.sitter_availability', 'UPDATE')::text
         || ', delete ' || has_table_privilege('authenticated', 'public.sitter_availability', 'DELETE')::text,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sitter_availability'::regclass)
         AND NOT has_table_privilege('authenticated', 'public.sitter_availability', 'INSERT')
         AND NOT has_table_privilege('authenticated', 'public.sitter_availability', 'UPDATE')
         AND NOT has_table_privilege('authenticated', 'public.sitter_availability', 'DELETE')
         AND EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sitter_availability'
                     AND policyname = 'Nomads read their own availability' AND qual LIKE '%sitter_user_id = auth.uid()%')

UNION ALL
SELECT 'get_sitter_free_dates: never booked sit details', 'returns start, end, days only',
       CASE WHEN position('listing' IN lower(pg_get_functiondef('public.get_sitter_free_dates(uuid)'::regprocedure))) > 0
              AND position('''title''' IN pg_get_functiondef('public.get_sitter_free_dates(uuid)'::regprocedure)) > 0
            THEN 'returns more' ELSE 'start, end, days' END,
       position('''title''' IN pg_get_functiondef('public.get_sitter_free_dates(uuid)'::regprocedure)) = 0
         AND position('''city''' IN pg_get_functiondef('public.get_sitter_free_dates(uuid)'::regprocedure)) = 0

UNION ALL
SELECT 'available_from/to kept in sync', 'trigger enabled',
       COALESCE((SELECT tgenabled::text FROM pg_trigger WHERE tgrelid = 'public.sitter_availability'::regclass AND tgname = 'sync_sitter_available_dates'), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sitter_availability'::regclass AND tgname = 'sync_sitter_available_dates' AND tgenabled <> 'D')

UNION ALL
SELECT 'export_account_data includes availability', 'present',
       CASE WHEN position('''availability''' IN pg_get_functiondef('public.export_account_data(uuid)'::regprocedure)) > 0 THEN 'present' ELSE 'missing' END,
       position('''availability''' IN pg_get_functiondef('public.export_account_data(uuid)'::regprocedure)) > 0

ORDER BY ok, item;
