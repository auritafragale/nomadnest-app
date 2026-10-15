-- Batch P1: leftover check. Run after batch_p1_member_test.sql. READ-ONLY.
-- Every count must be 0: the member test always rolls back.

SELECT
  (SELECT count(*) FROM public.perks WHERE slug = 'p1-test-perk' OR discount_code = 'P1TEST2099') AS test_perks,
  (SELECT count(*) FROM public.listings WHERE title = 'P1 sample listing' OR city = 'P1ville') AS test_listings,
  (SELECT count(*) FROM public.sits s JOIN public.listings l ON l.id = s.listing_id WHERE l.city = 'P1ville') AS test_sits;
