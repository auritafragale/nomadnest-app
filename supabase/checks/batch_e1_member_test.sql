-- Batch E1: behaviour test, acting as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Needs three non-admin, non-Founding members: a Nomad (with a Nomad
-- profile), a member with no listing (the test gives them a temporary one),
-- and a third member with no listing and no sits.
-- Test data: the title "E1 test listing 2099", text starting "E1 test 2099",
-- so supabase/checks/batch_e1_leftover.sql can prove nothing stayed.
-- Server-side updates of profiles clear the request claims first, or
-- prevent_privilege_escalation (correctly) refuses them.

DO $$
DECLARE
  v_owner uuid;
  v_nomad uuid;
  v_other uuid;
  v_listing uuid;
  v_conv uuid;
  v_conv2 uuid;
  r_a uuid; r_b uuid; r_c uuid; r_d uuid; r_e uuid; r_f uuid; r_1 uuid; r_2 uuid;
  s_a uuid; s_b uuid; s_c uuid; s_d uuid; s_e uuid; s_f uuid;
  v_review uuid;
  v_review2 uuid;
  v_app uuid;
  v_invite uuid;
  v_id uuid;
  v_room uuid;
  v_n integer;
  v_n2 integer;
  v_txt text;
  v_hint text;
  v_state text;
  v_bool boolean;
  v_failed boolean;
  v_json jsonb;
BEGIN
  -- ── Members ────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT sp.user_id INTO v_nomad
  FROM public.sitter_profiles sp JOIN public.profiles p ON p.id = sp.user_id
  WHERE p.is_admin IS NOT TRUE AND p.founding_member IS NOT TRUE
  ORDER BY p.created_at LIMIT 1;

  SELECT p.id INTO v_owner FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.founding_member IS NOT TRUE AND p.id <> v_nomad
    AND NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p.id)
  ORDER BY p.created_at LIMIT 1;

  SELECT p.id INTO v_other FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.founding_member IS NOT TRUE AND p.id NOT IN (v_owner, v_nomad)
    AND NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.sits s WHERE p.id IN (s.owner_user_id, s.sitter_user_id))
  ORDER BY p.created_at LIMIT 1;

  IF v_nomad IS NULL OR v_owner IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs three non-admin, non-Founding members: a Nomad, one with no listing, and one with no listing and no sits';
  END IF;

  -- ── Test data (as the server) ──────────────────────────────────────────
  UPDATE public.profiles
  SET membership_status = 'active', membership_type = 'sitter', membership_expiry = now() + interval '1 year',
      membership_payment_failed_at = NULL
  WHERE id = v_nomad;
  UPDATE public.profiles
  SET membership_status = 'active', membership_type = 'owner', membership_expiry = now() + interval '1 year',
      membership_payment_failed_at = NULL, id_verified = true
  WHERE id = v_owner;
  UPDATE public.sitter_profiles SET is_visible = true, is_active = true WHERE user_id = v_nomad;
  -- v_other: hidden and not discoverable (no listing, no sits by selection).
  UPDATE public.sitter_profiles SET is_visible = false, is_active = false WHERE user_id = v_other;
  UPDATE public.owner_profiles SET is_active = false WHERE user_id = v_other;

  INSERT INTO public.listings (owner_user_id, title, status, city, country, owner_declaration_accepted_at)
  VALUES (v_owner, 'E1 test listing 2099', 'published', 'Testville', 'Testland', now())
  RETURNING id INTO v_listing;
  UPDATE public.owner_profiles SET is_active = true WHERE user_id = v_owner;
  INSERT INTO public.pets (listing_id, type, name) VALUES (v_listing, 'cat', 'E1 test 2099 cat one'), (v_listing, 'cat', 'E1 test 2099 cat two');

  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date - 10, current_date - 1, 'booked') RETURNING id INTO r_a;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date - 30, current_date - 20, 'booked') RETURNING id INTO r_b;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date - 6, current_date + 3, 'booked') RETURNING id INTO r_c;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date + 5, current_date + 12, 'booked') RETURNING id INTO r_d;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date - 1, current_date + 4, 'booked') RETURNING id INTO r_e;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date - 9, current_date - 2, 'booked') RETURNING id INTO r_f;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 40, current_date + 45) RETURNING id INTO r_1;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 50, current_date + 55) RETURNING id INTO r_2;

  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at, completed_at)
  VALUES (v_listing, r_a, v_owner, v_nomad, 'completed', now() - interval '20 days', now()) RETURNING id INTO s_a;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at, completed_at)
  VALUES (v_listing, r_b, v_owner, v_nomad, 'completed', now() - interval '40 days', now() - interval '20 days') RETURNING id INTO s_b;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at, cancelled_at, cancelled_from_status)
  VALUES (v_listing, r_c, v_owner, v_nomad, 'cancelled', now() - interval '10 days', now() - interval '2 days', 'in_progress') RETURNING id INTO s_c;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at, completed_at)
  VALUES (v_listing, r_f, v_owner, v_nomad, 'completed', now() - interval '15 days', now()) RETURNING id INTO s_f;
  INSERT INTO public.conversations (listing_id, owner_user_id, sitter_user_id, conversation_type)
  VALUES (v_listing, v_owner, v_nomad, 'listing') RETURNING id INTO v_conv;

  -- ── 1. Profiles: who can read whose row ────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.profiles WHERE id = v_other;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a member could not read their own profile row'; END IF;
  SELECT count(*) INTO v_n FROM public.profiles WHERE id = v_owner;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a member could not read a discoverable profile'; END IF;
  v_failed := false;
  BEGIN
    SELECT count(*) INTO v_n FROM (SELECT email FROM public.profiles WHERE id = v_owner) x;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member could read someone else''s email'; END IF;
  v_failed := false;
  BEGIN
    SELECT count(*) INTO v_n FROM (SELECT phone_number FROM public.profiles WHERE id = v_owner) x;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member could read someone else''s phone'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.profiles WHERE id = v_other;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a member read a hidden Nomad they share nothing with'; END IF;
  SELECT count(*) INTO v_n FROM public.profiles WHERE id = v_nomad;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a member could not read someone they share a conversation and sits with'; END IF;
  RESET ROLE;

  -- A conversation makes the hidden member readable.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.conversations (owner_user_id, sitter_user_id, conversation_type)
  VALUES (v_owner, v_other, 'direct') RETURNING id INTO v_conv2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.profiles WHERE id = v_other;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a member could not read someone they share a conversation with'; END IF;
  RESET ROLE;

  -- Someone who blocked you is not readable, even with a shared chat.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.member_blocks (blocker_id, blocked_id) VALUES (v_other, v_owner) RETURNING blocker_id INTO v_id;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.profiles WHERE id = v_other;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a member read the profile of someone who blocked them'; END IF;
  SELECT count(*) INTO v_n FROM public.member_blocks;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a blocked member could read the block'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.member_blocks WHERE blocked_id = v_owner;
  RESET ROLE;

  -- ── 2. Reviews: the rules for writing one ──────────────────────────────
  SELECT COALESCE((SELECT review_count FROM public.member_ratings(ARRAY[v_nomad], 'sitter')), 0) INTO v_n2;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, text, would_again, highlights,
                                rating_pet_care, rating_communication, rating_cleanliness, rating_reliability, rating_respect_home)
    VALUES (s_a, v_owner, v_nomad, 5, 'E1 test 2099 lovely sit', true, ARRAY['great_with_cats', 'daily_photos'], 5, 5, 5, 5, 4)
    RETURNING id INTO v_review;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: a review could not be written (insert ... RETURNING id): %', SQLERRM;
  END;
  IF v_review IS NULL THEN RAISE EXCEPTION 'FAIL: the new review was not read back'; END IF;

  v_failed := false;
  BEGIN
    INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, text)
    VALUES (s_a, v_owner, v_nomad, 4, 'E1 test 2099 second') RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a second review for the same sit was accepted'; END IF;

  v_failed := false;
  BEGIN
    INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, text)
    VALUES (s_f, v_owner, v_other, 4, 'E1 test 2099 wrong person') RETURNING id INTO v_id;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a review of someone who was not on the sit was accepted'; END IF;

  v_failed := false;
  BEGIN
    INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, text)
    VALUES (s_b, v_owner, v_nomad, 4, 'E1 test 2099 too late') RETURNING id INTO v_id;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a review after the 14-day window was accepted'; END IF;

  v_failed := false;
  BEGIN
    INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, highlights)
    VALUES (s_f, v_owner, v_nomad, 4, ARRAY['great_with_pets', 'great_with_cats', 'spotless_home', 'extra_mile']) RETURNING id INTO v_id;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: more than 3 picks were accepted'; END IF;
  v_failed := false;
  BEGIN
    INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, highlights)
    VALUES (s_f, v_owner, v_nomad, 4, ARRAY['made_up_key']) RETURNING id INTO v_id;
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: an unknown pick was accepted'; END IF;

  -- A sit cut short while it was happening can still be reviewed.
  BEGIN
    INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, text, would_again, highlights, rating_pet_care)
    VALUES (s_c, v_owner, v_nomad, 4, 'E1 test 2099 cut short', false, ARRAY['great_with_cats'], 4)
    RETURNING id INTO v_review2;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: a sit cancelled while in progress could not be reviewed: %', SQLERRM;
  END;
  RESET ROLE;

  -- ── 3. Both reviews appear together ────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.reviews WHERE id = v_review;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the reviewee read a review before writing theirs'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT COALESCE((SELECT review_count FROM public.member_ratings(ARRAY[v_nomad], 'sitter')), 0) INTO v_n;
  IF v_n <> v_n2 THEN RAISE EXCEPTION 'FAIL: an unpublished review changed the average (% vs %)', v_n, v_n2; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.get_member_reviews(v_nomad, 'sitter', 'all', 'recent', 50, 0) g WHERE g.id = v_review;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: an unpublished review was in the reviews list'; END IF;
  RESET ROLE;

  -- The Nomad writes theirs: both publish.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, text, highlights,
                              rating_communication, rating_home_accuracy, rating_pet_preparedness, rating_hospitality, rating_clear_expectations)
  VALUES (s_a, v_nomad, v_owner, 5, 'E1 test 2099 lovely home', ARRAY['home_like_photos'], 5, 5, 5, 5, 5)
  RETURNING id INTO v_id;
  SELECT count(*) INTO v_n FROM public.reviews WHERE id = v_review;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the reviewee could not read the review once both were written'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF EXISTS (SELECT 1 FROM public.reviews WHERE sit_id = s_a AND published_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL: both reviews were written but not published together';
  END IF;

  -- The window-close job publishes a lone review once the window closes.
  UPDATE public.sits SET cancelled_at = now() - interval '15 days' WHERE id = s_c;
  PERFORM public.publish_due_reviews();
  IF EXISTS (SELECT 1 FROM public.reviews WHERE id = v_review2 AND published_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL: the window-close job did not publish a lone review';
  END IF;

  -- ── 4. What the reviews page shows ─────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT g.reviewer_first_name, g.city, g.sit_month IS NOT NULL AND g.nights IS NOT NULL AND g.pets ? 'cats', g.would_again
    INTO v_txt, v_state, v_bool, v_failed
  FROM public.get_member_reviews(v_nomad, 'sitter', 'all', 'recent', 50, 0) g WHERE g.id = v_review;
  IF v_txt IS DISTINCT FROM (SELECT NULLIF(btrim(first_name), '') FROM public.profiles WHERE id = v_owner) THEN
    RAISE EXCEPTION 'FAIL: the reviews list did not show the reviewer''s first name';
  END IF;
  IF v_state IS DISTINCT FROM 'Testville' OR NOT v_bool THEN
    RAISE EXCEPTION 'FAIL: the reviews list missed the place, month, nights or pets';
  END IF;
  IF v_failed IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: a Yes was not shown'; END IF;
  SELECT count(*) INTO v_n FROM public.get_member_reviews(v_nomad, 'sitter', 'all', 'recent', 50, 0) g WHERE g.would_again IS FALSE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a No answer was shown'; END IF;
  SELECT count(*) INTO v_n FROM public.get_member_reviews(v_nomad, 'sitter', 'all', 'recent', 50, 0) g WHERE g.id = v_review2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a published review was missing from the list'; END IF;

  v_json := public.get_member_review_summary(v_nomad, 'sitter');
  IF (v_json ->> 'would_again_answers')::integer < 3 AND v_json ->> 'would_again_pct' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the would-again percentage showed with fewer than 3 answers';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_json -> 'highlights') h WHERE (h ->> 'n')::integer < 2) THEN
    RAISE EXCEPTION 'FAIL: a pick chosen by fewer than 2 reviewers was shown';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_json -> 'highlights') h WHERE h ->> 'key' = 'great_with_cats') THEN
    RAISE EXCEPTION 'FAIL: a pick chosen by 2 reviewers was not shown';
  END IF;
  IF (v_json ->> 'count')::integer <> COALESCE((SELECT review_count FROM public.member_ratings(ARRAY[v_nomad], 'sitter')), 0) THEN
    RAISE EXCEPTION 'FAIL: the summary and the profile rating disagree';
  END IF;
  -- Members can't read the internal view.
  v_failed := false;
  BEGIN
    SELECT count(*) INTO v_n FROM public.review_facts;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member could read review_facts'; END IF;
  RESET ROLE;

  -- The list never carries flags, last names, emails or exact dates.
  SELECT pg_get_function_result(to_regprocedure('public.get_member_reviews(uuid,text,text,text,integer,integer)')) INTO v_txt;
  IF v_txt ~* '(flag|last_name|email|phone|start_date|end_date|evidence)' THEN
    RAISE EXCEPTION 'FAIL: get_member_reviews returns a private column: %', v_txt;
  END IF;

  -- Visitors get averages and counts only.
  SET LOCAL ROLE anon;
  v_failed := false;
  BEGIN
    SELECT count(*) INTO v_n FROM public.reviews;
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a signed-out visitor could read reviews'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.get_member_reviews(v_nomad, 'sitter');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a signed-out visitor could read the reviews list'; END IF;
  PERFORM public.member_ratings(ARRAY[v_nomad], 'sitter');
  RESET ROLE;

  -- Nothing across a block, either way.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.member_blocks (blocker_id, blocked_id) VALUES (v_nomad, v_other);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.get_member_reviews(v_nomad, 'sitter', 'all', 'recent', 50, 0);
  IF v_n <> 0 OR public.get_member_review_summary(v_nomad, 'sitter') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: reviews showed across a block';
  END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.member_blocks WHERE blocked_id = v_other;
  RESET ROLE;

  -- ── 5. Replies ─────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_failed := false;
  BEGIN
    INSERT INTO public.review_replies (review_id, author_user_id, body) VALUES (v_review, v_other, 'E1 test 2099 not mine');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: someone other than the reviewee replied'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_failed := false;
  BEGIN
    INSERT INTO public.review_replies (review_id, author_user_id, body) VALUES (v_review, v_owner, 'E1 test 2099 my own review');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: the reviewer replied to their own review'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.review_replies (review_id, author_user_id, body) VALUES (v_review, v_nomad, 'E1 test 2099 thank you') RETURNING id INTO v_id;
  v_failed := false;
  BEGIN
    INSERT INTO public.review_replies (review_id, author_user_id, body) VALUES (v_review, v_nomad, 'E1 test 2099 again');
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a second reply to the same review was accepted'; END IF;
  v_hint := NULL;
  BEGIN
    UPDATE public.review_replies SET body = 'E1 test 2099 this is shit' WHERE review_id = v_review;
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  IF v_hint IS DISTINCT FROM 'word_filter_swear' THEN RAISE EXCEPTION 'FAIL: swearing in a reply was accepted'; END IF;
  RESET ROLE;

  -- ── 6. Report a review ─────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, details)
  VALUES (v_other, 'review', v_review, 'false_or_misleading', 'E1 test 2099 report') RETURNING id INTO v_id;
  v_failed := false;
  BEGIN
    INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, details)
    VALUES (v_other, 'review', v_review, 'other', 'E1 test 2099 report again');
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: the same member reported the same review twice'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.reports WHERE target_id = v_review;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the reviewer could see who reported their review'; END IF;
  RESET ROLE;

  -- ── 7. Blocks ──────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, status, message)
  VALUES (v_listing, r_1, v_nomad, 'applied', 'E1 test 2099 application') RETURNING id INTO v_app;
  INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, message)
  VALUES (v_listing, r_2, v_owner, v_nomad, 'pending', 'E1 test 2099 invite') RETURNING id INTO v_invite;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, r_d, v_owner, v_nomad, 'confirmed', now()) RETURNING id INTO s_d;
  SELECT count(*) INTO v_n2 FROM public.cancellation_strikes WHERE user_id = v_nomad;

  -- The Nomad blocks the Pet Parent (with a confirmed sit in 5 days).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.member_blocks (blocker_id, blocked_id) VALUES (v_nomad, v_owner) RETURNING blocker_id INTO v_id;
  SELECT count(*) INTO v_n FROM public.sitter_invites WHERE id = v_invite;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a pending invitation stayed visible to the blocker'; END IF;
  v_failed := false;
  BEGIN
    INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, status, message)
    VALUES (v_listing, r_2, v_nomad, 'applied', 'E1 test 2099 apply across block');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member applied across a block'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.member_blocks;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the blocked member could read the block row'; END IF;
  v_failed := false;
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_user_id, body) VALUES (v_conv, v_owner, 'E1 test 2099 across a block');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a blocked member could still message'; END IF;
  v_txt := NULL;
  BEGIN
    INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status)
    VALUES (v_listing, r_1, v_owner, v_nomad, 'pending');
  EXCEPTION WHEN insufficient_privilege THEN v_txt := SQLERRM;
  END;
  IF v_txt IS NULL THEN RAISE EXCEPTION 'FAIL: a blocked member could still invite'; END IF;
  IF v_txt ~* 'block' THEN RAISE EXCEPTION 'FAIL: the refusal said why: %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM public.applications WHERE id = v_app;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a pending application stayed visible across a block'; END IF;
  SELECT count(*) INTO v_n FROM public.get_listing_applicants(v_listing) g WHERE g.application_id = v_app;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a pending application was in the applicants list across a block'; END IF;
  -- Blocking never hides a review.
  SELECT count(*) INTO v_n FROM public.reviews WHERE reviewer_user_id = v_nomad AND sit_id = s_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a block hid a review'; END IF;
  RESET ROLE;

  -- The confirmed sit was cancelled through the usual rules.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF NOT EXISTS (SELECT 1 FROM public.sits WHERE id = s_d AND status = 'cancelled' AND cancelled_from_status = 'confirmed') THEN
    RAISE EXCEPTION 'FAIL: blocking did not cancel the confirmed sit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sit_dates WHERE id = r_d AND status = 'open') THEN
    RAISE EXCEPTION 'FAIL: the cancelled sit''s dates did not open again';
  END IF;
  SELECT count(*) INTO v_n FROM public.cancellation_strikes WHERE user_id = v_nomad;
  IF v_n <> v_n2 + 1 THEN RAISE EXCEPTION 'FAIL: the reliability strike rule did not apply (within 2 weeks of the start)'; END IF;
  -- The notification queued for the Pet Parent never mentions blocking.
  IF to_regclass('net.http_request_queue') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM net.http_request_queue
               WHERE convert_from(body, 'UTF8') LIKE '%sit_cancelled%' AND convert_from(body, 'UTF8') LIKE '%' || $1 || '%'
                 AND convert_from(body, 'UTF8') ILIKE '%block%'$q$
      INTO v_n USING s_d::text;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the cancellation notification mentions blocking'; END IF;
  END IF;

  -- Unblock: the pending application and invitation come back.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.member_blocks WHERE blocked_id = v_owner;
  SELECT count(*) INTO v_n FROM public.sitter_invites WHERE id = v_invite;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the invitation did not come back after unblocking'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.applications WHERE id = v_app;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the application did not come back after unblocking'; END IF;
  RESET ROLE;

  -- A sit happening now keeps its chat open.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, r_e, v_owner, v_nomad, 'in_progress', now() - interval '3 days') RETURNING id INTO s_e;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.member_blocks (blocker_id, blocked_id) VALUES (v_owner, v_nomad);
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_user_id, body) VALUES (v_conv, v_owner, 'E1 test 2099 keys are under the mat');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: the chat of a sit happening now closed after a block: %', SQLERRM;
  END;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.sits WHERE id = s_e AND status = 'in_progress') THEN
    RAISE EXCEPTION 'FAIL: blocking changed a sit that is happening now';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM public.member_blocks WHERE blocked_id = v_nomad;
  RESET ROLE;

  -- ── 8. Word filter ─────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF public.text_violation('Scunthorpe') IS NOT NULL OR public.text_violation('a first class sit') IS NOT NULL
     OR public.text_violation('we assess every home') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: an innocent word was caught by the filter';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  -- Banned: refused in a private message, a review and a bio.
  v_hint := NULL;
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_user_id, body) VALUES (v_conv, v_nomad, 'E1 test 2099 I''ll kill you');
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  IF v_hint IS DISTINCT FROM 'word_filter_banned' THEN RAISE EXCEPTION 'FAIL: a banned word was sent in a message'; END IF;
  v_hint := NULL;
  BEGIN
    INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, text)
    VALUES (s_f, v_nomad, v_owner, 3, 'E1 test 2099 nigger');
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  IF v_hint IS DISTINCT FROM 'word_filter_banned' THEN RAISE EXCEPTION 'FAIL: a banned word was accepted in a review'; END IF;
  v_hint := NULL;
  BEGIN
    UPDATE public.profiles SET bio = 'E1 test 2099 porn' WHERE id = v_nomad;
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  IF v_hint IS DISTINCT FROM 'word_filter_banned' THEN RAISE EXCEPTION 'FAIL: a banned word was accepted in a bio'; END IF;

  -- Swearing: sent in a 1:1 chat; refused in a review, a bio and City Chat.
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_user_id, body) VALUES (v_conv, v_nomad, 'E1 test 2099 this is shit, sorry');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: swearing was refused in a private chat: %', SQLERRM;
  END;
  IF NOT public.text_has_swearing('this is shit') THEN RAISE EXCEPTION 'FAIL: the chat swearing note would not show'; END IF;
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_user_id, body) VALUES (v_conv, v_nomad, 'E1 test 2099 Scunthorpe has a first class vet, we assess it');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: innocent words were refused: %', SQLERRM;
  END;
  v_hint := NULL;
  BEGIN
    INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, text)
    VALUES (s_f, v_nomad, v_owner, 3, 'E1 test 2099 the flat was shit');
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  IF v_hint IS DISTINCT FROM 'word_filter_swear' THEN RAISE EXCEPTION 'FAIL: swearing was accepted in a review'; END IF;
  v_hint := NULL;
  BEGIN
    UPDATE public.profiles SET bio = 'E1 test 2099 fucking great' WHERE id = v_nomad;
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  IF v_hint IS DISTINCT FROM 'word_filter_swear' THEN RAISE EXCEPTION 'FAIL: swearing was accepted in a bio'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_hint := NULL;
  BEGIN
    UPDATE public.listings SET title = 'E1 test listing 2099 shit view' WHERE id = v_listing;
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
  END;
  IF v_hint IS DISTINCT FROM 'word_filter_swear' THEN RAISE EXCEPTION 'FAIL: swearing was accepted in a listing'; END IF;
  -- Members can't read or change the list.
  SELECT count(*) INTO v_n FROM public.blocked_terms;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a member could read the word list'; END IF;
  v_failed := false;
  BEGIN
    INSERT INTO public.blocked_terms (term, level) VALUES ('e1testword', 'swear');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL: a member could add to the word list'; END IF;
  RESET ROLE;

  -- City Chat: the Nomad's sit happening now in Testville opens that room.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT r.id INTO v_room FROM public.city_chat_rooms r WHERE r.city_key = public.city_chat_key('Testville', 'Testland');
  IF v_room IS NOT NULL AND public.can_access_city_chat(v_room, v_nomad) THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_hint := NULL;
    BEGIN
      INSERT INTO public.city_chat_messages (room_id, sender_user_id, content) VALUES (v_room, v_nomad, 'E1 test 2099 what the fuck');
    EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    END;
    IF v_hint IS DISTINCT FROM 'word_filter_swear' THEN RAISE EXCEPTION 'FAIL: swearing was accepted in City Chat'; END IF;
    RESET ROLE;
  ELSE
    -- No room for this city: check the City Chat trigger directly instead.
    IF NOT EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = 'public.city_chat_messages'::regclass AND tg.tgname = 'word_filter'
                   AND encode(tg.tgargs, 'escape') LIKE 'public%') THEN
      RAISE EXCEPTION 'FAIL: City Chat has no public word filter';
    END IF;
  END IF;

  -- ── 9. Grants ──────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
    AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % TRUNCATE, TRIGGER or REFERENCES grants left for visitors or members', v_n; END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;

-- Leftover check (run after the test): supabase/checks/batch_e1_leftover.sql.
-- Every count must be 0.
