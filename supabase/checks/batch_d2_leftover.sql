-- Batch D2 (and the D2 fix): leftover check. Run after
-- batch_d2_member_test.sql. READ-ONLY. Every count must be 0: the member
-- test always rolls back, so none of its test data may stay.

SELECT
  (SELECT count(*) FROM public.listings WHERE title = 'D2 test listing 2099') AS test_listings,
  (SELECT count(*) FROM public.sit_dates sd JOIN public.listings l ON l.id = sd.listing_id
     WHERE l.title = 'D2 test listing 2099') AS test_dates,
  (SELECT count(*) FROM public.pets WHERE name = 'D2 test 2099') AS test_pets,
  (SELECT count(*) FROM public.applications WHERE message LIKE 'D2 test 2099%') AS test_applications,
  (SELECT count(*) FROM public.sitter_invites WHERE message LIKE 'D2 test 2099%') AS test_invites,
  (SELECT count(*) FROM public.messages WHERE body LIKE 'D2 test 2099%') AS test_messages,
  (SELECT count(*) FROM public.notifications WHERE title LIKE '%D2 test listing 2099%') AS test_notifications,
  (SELECT count(*) FROM public.founding_member_codes WHERE code LIKE 'D2TEST2099%') AS test_codes,
  (SELECT count(*) FROM public.founding_redemptions r JOIN public.founding_member_codes c ON c.id = r.code_id
     WHERE c.code LIKE 'D2TEST2099%') AS test_redemptions;
