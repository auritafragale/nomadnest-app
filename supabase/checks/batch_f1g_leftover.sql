-- Batch F1g: leftover check. Run after batch_f1g_member_test.sql. READ-ONLY.
-- Every count must be 0: the member test always rolls back.

SELECT
  (SELECT count(*) FROM public.perks WHERE slug = 'f1g-test-perk' OR discount_code = 'F1GTEST2099') AS test_perks,
  (SELECT count(*) FROM public.listings WHERE title = 'F1g sample listing' OR city = 'F1gville') AS test_listings,
  (SELECT count(*) FROM public.city_chat_rooms WHERE city = 'F1gville') AS test_rooms;
