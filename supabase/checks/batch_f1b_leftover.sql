-- Batch F1b: leftover check. Run after batch_f1b_member_test.sql. READ-ONLY.
-- Every count must be 0: the member test always rolls back.

SELECT
  (SELECT count(*) FROM public.listings WHERE title LIKE 'F1b test 2099%' OR city = 'Testville F1b') AS test_listings,
  (SELECT count(*) FROM public.sitter_invites WHERE message LIKE 'F1b test 2099%') AS test_invites,
  (SELECT count(*) FROM public.applications WHERE message LIKE 'F1b test 2099%') AS test_applications,
  (SELECT count(*) FROM public.messages WHERE body LIKE 'F1b test 2099%') AS test_messages,
  (SELECT count(*) FROM public.notifications
   WHERE (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%Testville F1b%'
      OR (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%F1b test 2099%') AS test_notifications;
