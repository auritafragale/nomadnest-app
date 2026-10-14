-- Batch F1c: leftover check. Run after batch_f1c_member_test.sql. READ-ONLY.
-- Every count must be 0: the member test always rolls back.

SELECT
  (SELECT count(*) FROM public.listings WHERE title = 'F1c sample listing' OR city = 'Testville F1c') AS test_listings,
  (SELECT count(*) FROM public.sitter_invites WHERE message LIKE 'F1c test 2099%') AS test_invites,
  (SELECT count(*) FROM public.applications a JOIN public.listings l ON l.id = a.listing_id WHERE l.city = 'Testville F1c') AS test_applications,
  (SELECT count(*) FROM public.manual_id_verifications
   WHERE notes LIKE 'F1c test 2099%' OR id_photo_path ~ '/draft/id-[1-4]\.jpg$' OR selfie_path ~ '/draft/selfie-[1-3]\.jpg$') AS test_id_checks,
  (SELECT count(*) FROM public.notifications
   WHERE (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%Testville F1c%'
      OR (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%F1c test 2099%') AS test_notifications;
