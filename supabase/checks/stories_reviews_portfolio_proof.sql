-- Sit Story portfolio, review notifications and "Write it again" removal:
-- proof that the live database matches 20260928120000_stories_reviews_portfolio.sql.
-- READ-ONLY. One row per check; every row should have ok = true.

WITH
fn(name, marker, present) AS (VALUES
  ('notify_review_received', 'send-notification-email', true),
  ('notify_review_received', '''review''', true),
  ('push_on_notification_insert', 'sit_story_ready_sitter', false),
  ('push_on_notification_insert', 'sit_update_loved', true),
  ('get_sit_story', 'can_rewrite', false),
  ('get_sit_story', 'rewrit', false),
  ('decide_sit_story_portfolio', '''revoke''', false),
  ('decide_sit_story_portfolio', 'portfolio_status <> ''requested''', true),
  ('remove_sit_story_portfolio_photo', 'owner_user_id IS DISTINCT FROM auth.uid()', true),
  ('remove_sit_story_portfolio_photo', 'array_remove', true),
  ('get_portfolio_story', 'portfolio_status = ''approved''', true),
  ('get_portfolio_story', 'auth.uid() IS NOT NULL', true)
),
member_fn(name) AS (VALUES
  ('get_portfolio_story'), ('remove_sit_story_portfolio_photo'), ('decide_sit_story_portfolio'), ('get_sit_story')
)

SELECT format('function %s %s "%s"', f.name, CASE WHEN f.present THEN 'has' ELSE 'no longer has' END, f.marker) AS item,
       CASE WHEN f.present THEN 'present' ELSE 'absent' END AS expected,
       CASE WHEN p.oid IS NULL THEN 'function missing'
            WHEN position(f.marker IN pg_get_functiondef(p.oid)) > 0 THEN 'present' ELSE 'absent' END AS actual,
       p.oid IS NOT NULL AND (position(f.marker IN pg_get_functiondef(p.oid)) > 0) = f.present AS ok
FROM fn f
LEFT JOIN pg_proc p ON p.proname = f.name AND p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT format('function %s: members yes, anon no', p.proname), 'true / false',
       has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || ' / ' || has_function_privilege('anon', p.oid, 'EXECUTE')::text,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
FROM pg_proc p JOIN member_fn m ON m.name = p.proname
WHERE p.pronamespace = 'public'::regnamespace

UNION ALL
SELECT 'notify_review_received: trigger only', 'no member or anon execute',
       has_function_privilege('authenticated', 'public.notify_review_received()', 'EXECUTE')::text || ' / ' ||
       has_function_privilege('anon', 'public.notify_review_received()', 'EXECUTE')::text,
       NOT has_function_privilege('authenticated', 'public.notify_review_received()', 'EXECUTE')
         AND NOT has_function_privilege('anon', 'public.notify_review_received()', 'EXECUTE')

UNION ALL
SELECT 'trigger notify_review_received on reviews', 'enabled, AFTER INSERT',
       COALESCE((SELECT tgenabled::text FROM pg_trigger
                 WHERE tgrelid = 'public.reviews'::regclass AND tgname = 'notify_review_received'), 'missing'),
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgrelid = 'public.reviews'::regclass AND tgname = 'notify_review_received' AND tgenabled <> 'D')

UNION ALL
SELECT 'reviews: only one notifying trigger', '1',
       count(*)::text,
       count(*) = 1
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.reviews'::regclass AND NOT t.tgisinternal
  AND (position('notifications' IN pg_get_functiondef(p.oid)) > 0
       OR position('send-notification-email' IN pg_get_functiondef(p.oid)) > 0)

UNION ALL
SELECT 'request_sit_story_rewrite removed', 'absent',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'request_sit_story_rewrite' AND pronamespace = 'public'::regnamespace)
            THEN 'still there' ELSE 'absent' END,
       NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'request_sit_story_rewrite' AND pronamespace = 'public'::regnamespace)

UNION ALL
SELECT 'sit_stories rewrite columns removed', 'none',
       COALESCE(string_agg(column_name, ', '), 'none'),
       count(*) = 0
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sit_stories'
  AND column_name IN ('rewrites_used', 'rewrite_requested_at')

UNION ALL
SELECT 'approved stories: photos all from the story', '0 outside',
       count(*)::text || ' outside',
       count(*) = 0
FROM public.sit_stories
WHERE portfolio_status = 'approved' AND NOT (portfolio_photo_paths <@ photo_paths)

ORDER BY ok, item;
