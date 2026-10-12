-- Batch E1: leftover check. Run after batch_e1_member_test.sql. READ-ONLY.
-- Every count must be 0: the member test always rolls back, so none of its
-- test data may stay.

SELECT
  (SELECT count(*) FROM public.listings WHERE title LIKE 'E1 test listing 2099%') AS test_listings,
  (SELECT count(*) FROM public.sit_dates sd JOIN public.listings l ON l.id = sd.listing_id
     WHERE l.title LIKE 'E1 test listing 2099%') AS test_dates,
  (SELECT count(*) FROM public.pets WHERE name LIKE 'E1 test 2099%') AS test_pets,
  (SELECT count(*) FROM public.reviews WHERE text LIKE 'E1 test 2099%') AS test_reviews,
  (SELECT count(*) FROM public.review_replies WHERE body LIKE 'E1 test 2099%') AS test_replies,
  (SELECT count(*) FROM public.reports WHERE details LIKE 'E1 test 2099%') AS test_reports,
  (SELECT count(*) FROM public.applications WHERE message LIKE 'E1 test 2099%') AS test_applications,
  (SELECT count(*) FROM public.sitter_invites WHERE message LIKE 'E1 test 2099%') AS test_invites,
  (SELECT count(*) FROM public.messages WHERE body LIKE 'E1 test 2099%') AS test_messages,
  (SELECT count(*) FROM public.city_chat_messages WHERE content LIKE 'E1 test 2099%') AS test_city_chat,
  (SELECT count(*) FROM public.notifications WHERE title LIKE '%E1 test listing 2099%' OR message LIKE '%E1 test listing 2099%') AS test_notifications,
  (SELECT count(*) FROM public.blocked_terms WHERE term = 'e1testword') AS test_terms;
