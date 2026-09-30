-- Stage 4 (AI): proof that the live database matches 20260928134351_6c341758-b490-4f28-8c86-29b9d456ccc0.sql (AI dates, alt text).
-- READ-ONLY. One row per check; every row should have ok = true.

SELECT format('flag %s exists', k) AS item, 'present (off until you switch it on)' AS expected,
       COALESCE((SELECT value::text FROM public.app_settings WHERE key = k), 'missing') AS actual,
       EXISTS (SELECT 1 FROM public.app_settings WHERE key = k) AS ok
FROM (VALUES ('availability_ai_enabled'), ('photo_alt_text_enabled')) AS v(k)

UNION ALL
SELECT 'sit_stories.photo_alt column', 'jsonb',
       COALESCE((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sit_stories' AND column_name = 'photo_alt'), 'missing'),
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sit_stories' AND column_name = 'photo_alt' AND data_type = 'jsonb')

UNION ALL
SELECT 'alt text queued once when a story is ready', 'trigger enabled, checks the flag',
       COALESCE((SELECT tgenabled::text FROM pg_trigger WHERE tgrelid = 'public.sit_stories'::regclass AND tgname = 'queue_photo_alt_text'), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sit_stories'::regclass AND tgname = 'queue_photo_alt_text' AND tgenabled <> 'D')
         AND position('photo_alt_text_enabled' IN pg_get_functiondef('public.queue_photo_alt_text()'::regprocedure)) > 0

UNION ALL
SELECT 'admin_queue_photo_alt_text: admins only', 'is_admin_user check, no anon',
       CASE WHEN position('is_admin_user' IN pg_get_functiondef('public.admin_queue_photo_alt_text(uuid)'::regprocedure)) > 0 THEN 'checks admin' ELSE 'no admin check' END
         || ', anon ' || has_function_privilege('anon', 'public.admin_queue_photo_alt_text(uuid)', 'EXECUTE')::text,
       position('is_admin_user' IN pg_get_functiondef('public.admin_queue_photo_alt_text(uuid)'::regprocedure)) > 0
         AND NOT has_function_privilege('anon', 'public.admin_queue_photo_alt_text(uuid)', 'EXECUTE')

UNION ALL
SELECT format('%s: alt text of approved photos only', f), 'filtered by portfolio_photo_paths',
       CASE WHEN position('a.key = ANY (ss.portfolio_photo_paths)' IN pg_get_functiondef(format('public.%s', f)::regprocedure)) > 0
            THEN 'filtered' ELSE 'not filtered' END,
       position('a.key = ANY (ss.portfolio_photo_paths)' IN pg_get_functiondef(format('public.%s', f)::regprocedure)) > 0
FROM (VALUES ('get_portfolio_story(uuid)'), ('get_shared_sit_story(text)')) AS v(f)

ORDER BY ok, item;
