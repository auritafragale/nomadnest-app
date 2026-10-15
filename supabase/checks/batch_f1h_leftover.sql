-- Batch F1h: leftover check. Run after batch_f1h_member_test.sql. READ-ONLY.
-- Every count must be 0: the member test always rolls back.

SELECT
  (SELECT count(*) FROM public.listings WHERE title = 'F1h sample listing' OR city = 'F1hville') AS test_listings,
  (SELECT count(*) FROM public.sits s JOIN public.listings l ON l.id = s.listing_id WHERE l.city = 'F1hville') AS test_sits,
  (SELECT count(*) FROM public.city_chat_rooms WHERE city = 'F1hville') AS test_rooms;
