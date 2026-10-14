-- Batch E1 fixes: behaviour test, acting as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Proves: a report with a matching chat keeps it; a report with a chat that
-- isn't between the two members is saved with conversation_id NULL; a review
-- can still only be reported once by the same member.
-- Needs three non-admin members; the third needs no listing (the test gives
-- them a temporary one). Test data: "E1F test 2099", checked by the leftover
-- query at the end.

DO $$
DECLARE
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_listing uuid;
  v_range uuid;
  v_sit uuid;
  v_review uuid;
  v_conv_ab uuid;
  v_conv_ac uuid;
  v_report uuid;
  v_kept uuid;
  v_failed boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT p.id INTO v_a FROM public.profiles p WHERE p.is_admin IS NOT TRUE ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO v_b FROM public.profiles p WHERE p.is_admin IS NOT TRUE AND p.id <> v_a ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO v_c FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id NOT IN (v_a, v_b)
    AND NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p.id)
  ORDER BY p.created_at LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs three non-admin members, the third with no listing';
  END IF;

  -- Test data (as the server): two chats for v_a, and a published review of
  -- v_c written by v_b.
  INSERT INTO public.conversations (owner_user_id, sitter_user_id, conversation_type)
  VALUES (v_a, v_b, 'direct') RETURNING id INTO v_conv_ab;
  INSERT INTO public.conversations (owner_user_id, sitter_user_id, conversation_type)
  VALUES (v_c, v_a, 'direct') RETURNING id INTO v_conv_ac;

  INSERT INTO public.listings (owner_user_id, title, status, city, country, owner_declaration_accepted_at)
  VALUES (v_c, 'E1F test 2099 listing', 'draft', 'Testville', 'Testland', now()) RETURNING id INTO v_listing;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status)
  VALUES (v_listing, current_date - 10, current_date - 1, 'booked') RETURNING id INTO v_range;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at, completed_at)
  VALUES (v_listing, v_range, v_c, v_b, 'completed', now() - interval '20 days', now()) RETURNING id INTO v_sit;
  INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, text, published_at, rating_communication)
  VALUES (v_sit, v_b, v_c, 5, 'E1F test 2099 review', now(), 5) RETURNING id INTO v_review;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. The chat between v_a and v_b is kept on a report about v_b.
  BEGIN
    INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, details, conversation_id)
    VALUES (v_a, 'user', v_b, 'felt_unsafe', 'E1F test 2099 matching chat', v_conv_ab) RETURNING id INTO v_report;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: a report with the matching chat failed: %', SQLERRM;
  END;
  SELECT conversation_id INTO v_kept FROM public.reports WHERE id = v_report;
  IF v_kept IS DISTINCT FROM v_conv_ab THEN RAISE EXCEPTION 'FAIL: the matching chat was not kept on the report'; END IF;

  -- 2. A chat with someone else (v_a and v_c) on a report about v_b: the
  -- report is saved, without the chat.
  v_report := NULL;
  BEGIN
    INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, details, conversation_id)
    VALUES (v_a, 'user', v_b, 'other', 'E1F test 2099 other chat', v_conv_ac) RETURNING id INTO v_report;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: a report with a chat that doesn''t match failed: %', SQLERRM;
  END;
  IF v_report IS NULL THEN RAISE EXCEPTION 'FAIL: the report was not saved'; END IF;
  SELECT conversation_id INTO v_kept FROM public.reports WHERE id = v_report;
  IF v_kept IS NOT NULL THEN RAISE EXCEPTION 'FAIL: a chat that doesn''t match was attached'; END IF;

  -- A made-up chat id is dropped too.
  v_report := NULL;
  INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, details, conversation_id)
  VALUES (v_a, 'user', v_b, 'other', 'E1F test 2099 unknown chat', gen_random_uuid()) RETURNING id INTO v_report;
  IF v_report IS NULL OR (SELECT conversation_id FROM public.reports WHERE id = v_report) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a made-up chat id was not dropped';
  END IF;

  -- 3. A review can still only be reported once by the same member.
  INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, details)
  VALUES (v_a, 'review', v_review, 'false_or_misleading', 'E1F test 2099 review report') RETURNING id INTO v_report;
  v_failed := false;
  BEGIN
    INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, details)
    VALUES (v_a, 'review', v_review, 'other', 'E1F test 2099 review report again');
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: the same member reported the same review twice'; END IF;
  RESET ROLE;

  -- The review rules still stand: the writer can't report their own review.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_failed := false;
  BEGIN
    INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, details)
    VALUES (v_b, 'review', v_review, 'other', 'E1F test 2099 own review');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member reported their own review'; END IF;
  RESET ROLE;

  -- The AI review summary is on.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'review_summary_enabled' AND value = 'true'::jsonb) THEN
    RAISE EXCEPTION 'FAIL: review_summary_enabled is not on';
  END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;

-- Leftover check (run after the test). Every count must be 0.
-- SELECT
--   (SELECT count(*) FROM public.reports WHERE details LIKE 'E1F test 2099%') AS test_reports,
--   (SELECT count(*) FROM public.reviews WHERE text LIKE 'E1F test 2099%') AS test_reviews,
--   (SELECT count(*) FROM public.listings WHERE title LIKE 'E1F test 2099%') AS test_listings;
