-- Stage 3 (Pet Parent screens): proof that the live database matches 20260928180000_parent_screens.sql.
-- READ-ONLY. One row per check; every row should have ok = true.

WITH
fn(name, marker) AS (VALUES
  ('withdraw_sit_story_portfolio', 'owner_user_id IS DISTINCT FROM auth.uid()'),
  ('withdraw_sit_story_portfolio', 'sit_story_portfolio_withdrawn'),
  ('withdraw_sit_story_portfolio', 'disable_sit_story_share_links'),
  ('set_sit_story_portfolio_request', 'can''t be added again'),
  ('get_sit_story', 'story_days'),
  ('get_sit_story', 'updates_expected'),
  ('create_sit_story_share_link', 'owner_user_id IS DISTINCT FROM auth.uid()'),
  ('get_shared_sit_story', 'share_name_in_stories'),
  ('get_shared_sit_story', 'portfolio_photo_paths'),
  ('hit_shared_sit_story', 'hits > 60'),
  ('disable_share_links_on_story_change', 'revoked')
),
grants(name, member, anon, service) AS (VALUES
  ('withdraw_sit_story_portfolio', true, false, true),
  ('create_sit_story_share_link', true, false, true),
  ('disable_my_sit_story_share_link', true, false, true),
  ('get_shared_sit_story', false, false, true),
  ('hit_shared_sit_story', false, false, true),
  ('disable_sit_story_share_links', false, false, true)
)

SELECT format('function %s has %s', f.name, f.marker) AS item, 'present' AS expected,
       CASE WHEN p.oid IS NULL THEN 'missing'
            WHEN position(f.marker IN pg_get_functiondef(p.oid)) > 0 THEN 'present' ELSE 'marker missing' END AS actual,
       p.oid IS NOT NULL AND position(f.marker IN pg_get_functiondef(p.oid)) > 0 AS ok
FROM fn f LEFT JOIN pg_proc p ON p.proname = f.name AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT format('function %s: member %s, anon %s', g.name, g.member, g.anon), 'as planned',
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE 'member ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
              || ', anon ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
              || ', service ' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text END,
       p.oid IS NOT NULL
         AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = g.member
         AND has_function_privilege('anon', p.oid, 'EXECUTE') = g.anon
         AND has_function_privilege('service_role', p.oid, 'EXECUTE') = g.service
FROM grants g LEFT JOIN pg_proc p ON p.proname = g.name AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT format('%s: RLS on, no member or anon access', t), 'RLS on, no privileges',
       (SELECT relrowsecurity::text FROM pg_class WHERE oid = format('public.%I', t)::regclass)
         || ', member ' || has_table_privilege('authenticated', format('public.%I', t), 'SELECT,INSERT,UPDATE,DELETE')::text
         || ', anon ' || has_table_privilege('anon', format('public.%I', t), 'SELECT,INSERT,UPDATE,DELETE')::text,
       (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass)
         AND NOT has_table_privilege('authenticated', format('public.%I', t), 'SELECT,INSERT,UPDATE,DELETE')
         AND NOT has_table_privilege('anon', format('public.%I', t), 'SELECT,INSERT,UPDATE,DELETE')
FROM (VALUES ('sit_story_share_links'), ('sit_story_share_hits')) AS v(t)

UNION ALL
SELECT 'share hits store no IP or user', 'link_id, minute, hits only',
       string_agg(column_name, ', ' ORDER BY column_name),
       string_agg(column_name, ', ' ORDER BY column_name) = 'hits, link_id, minute'
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sit_story_share_hits'

UNION ALL
SELECT 'share links switch off automatically', 'trigger enabled',
       COALESCE((SELECT tgenabled::text FROM pg_trigger WHERE tgrelid = 'public.sit_stories'::regclass AND tgname = 'disable_share_links_on_story_change'), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sit_stories'::regclass AND tgname = 'disable_share_links_on_story_change' AND tgenabled <> 'D')

UNION ALL
SELECT 'sit_stories.story_days column', 'jsonb',
       COALESCE((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sit_stories' AND column_name = 'story_days'), 'missing'),
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sit_stories' AND column_name = 'story_days' AND data_type = 'jsonb')

UNION ALL
SELECT 'reports can target a Sit Story', 'sit_story in report_target_type',
       array_to_string(enum_range(NULL::public.report_target_type)::text[], ', '),
       'sit_story' = ANY (enum_range(NULL::public.report_target_type)::text[])

UNION ALL
SELECT 'export includes share links, never tokens', 'sit_story_share_links present, no token key',
       CASE WHEN position('sit_story_share_links' IN pg_get_functiondef('public.export_account_data(uuid)'::regprocedure)) = 0 THEN 'missing'
            WHEN position('''token''' IN pg_get_functiondef('public.export_account_data(uuid)'::regprocedure)) > 0 THEN 'exports token'
            ELSE 'present, no token' END,
       position('sit_story_share_links' IN pg_get_functiondef('public.export_account_data(uuid)'::regprocedure)) > 0
         AND position('''token''' IN pg_get_functiondef('public.export_account_data(uuid)'::regprocedure)) = 0

ORDER BY ok, item;
