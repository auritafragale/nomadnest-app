-- Batch F1d: leftover check. Run after batch_f1d_member_test.sql, and after
-- any test that makes a temporary "Regression sample listing". READ-ONLY.
-- Every count must be 0: the member tests always roll back.

SELECT
  (SELECT count(*) FROM public.manual_id_verifications
   WHERE notes LIKE 'F1d test 2099%' OR id_photo_path LIKE '%/draft/f1d-%' OR selfie_path LIKE '%/draft/f1d-%') AS test_id_checks,
  (SELECT count(*) FROM public.listings WHERE title = 'Regression sample listing' OR city = 'Regressville') AS test_listings,
  (SELECT count(*) FROM public.sit_dates sd JOIN public.listings l ON l.id = sd.listing_id WHERE l.city = 'Regressville') AS test_dates,
  (SELECT count(*) FROM public.reports WHERE reason = 'Member test' AND details = 'Rolled back') AS test_reports,
  (SELECT count(*) FROM public.notifications
   WHERE (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%Regressville%'
      OR (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%F1d test 2099%') AS test_notifications;
