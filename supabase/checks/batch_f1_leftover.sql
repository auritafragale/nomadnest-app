-- Batch F1: leftover check. Run after batch_f1_member_test.sql. READ-ONLY.
-- Every count must be 0: the member test always rolls back.

SELECT
  (SELECT count(*) FROM public.listings WHERE title LIKE 'F1 test 2099%') AS test_listings,
  (SELECT count(*) FROM public.applications WHERE message LIKE 'F1 test 2099%') AS test_applications,
  (SELECT count(*) FROM public.sitter_invites WHERE message LIKE 'F1 test 2099%') AS test_invites,
  (SELECT count(*) FROM public.sit_reschedule_requests WHERE note LIKE 'F1 test 2099%') AS test_reschedules,
  (SELECT count(*) FROM public.sit_checkins WHERE note LIKE 'F1 test 2099%') AS test_updates,
  (SELECT count(*) FROM public.reports WHERE details LIKE 'F1 test 2099%') AS test_reports,
  (SELECT count(*) FROM public.manual_id_verifications WHERE notes LIKE 'F1 test 2099%') AS test_id_checks,
  (SELECT count(*) FROM public.notifications WHERE message LIKE '%Testville%' OR title LIKE '%Testville%') AS test_notifications;
