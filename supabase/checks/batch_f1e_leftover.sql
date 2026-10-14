-- Batch F1e: leftover check. Run after batch_f1e_member_test.sql. READ-ONLY.
-- Every count must be 0: the member test always rolls back.

SELECT
  (SELECT count(*) FROM public.listings WHERE title = 'F1e sample listing' OR city = 'Testville F1e') AS test_listings,
  (SELECT count(*) FROM public.sitter_invites WHERE message LIKE 'F1e test 2099%') AS test_invites,
  (SELECT count(*) FROM public.applications WHERE message LIKE 'F1e test 2099%') AS test_applications,
  (SELECT count(*) FROM public.sit_reschedule_requests WHERE note LIKE 'F1e test 2099%') AS test_reschedules,
  (SELECT count(*) FROM public.sits s JOIN public.listings l ON l.id = s.listing_id WHERE l.city = 'Testville F1e') AS test_sits,
  (SELECT count(*) FROM public.notifications
   WHERE (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%Testville F1e%'
      OR (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%F1e test 2099%') AS test_notifications;
