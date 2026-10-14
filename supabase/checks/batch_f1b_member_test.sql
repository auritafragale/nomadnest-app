-- Batch F1b: behaviour test, acting as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Every action is done as the member who does it in the app. Text the test
-- members "write" starts with "F1b test 2099" and must never reach a
-- notification. The test listing's city is "Testville F1b"; its title,
-- "F1b sample listing", has no marker, because a listing title rightly
-- appears in alerts such as New message.
-- Needs: a non-admin, non-Founding Nomad (with a Nomad profile), a non-admin,
-- non-Founding member with no listing (given a temporary one), and one more
-- non-admin member.

DO $$
DECLARE
  v_owner uuid;
  v_nomad uuid;
  v_other uuid;
  v_listing uuid;
  r_1 uuid; r_2 uuid; r_3 uuid; r_4 uuid; r_5 uuid; r_c uuid;
  v_conv uuid;
  v_conv_other uuid;
  v_app5 uuid;
  v_invite1 uuid;
  v_n integer;
  v_text text;
  v_raised boolean;
  v_note constant text := 'Hi! I''d love to invite you to sit at my home. I''ve sent you a formal invitation — please check your notifications.';
BEGIN
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
  WHERE p.is_admin IS NOT TRUE AND p.id NOT IN (v_nomad, v_owner)
  ORDER BY p.created_at LIMIT 1;
  IF v_nomad IS NULL OR v_owner IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a non-admin, non-Founding Nomad, a non-admin, non-Founding member with no listing, and one more non-admin member';
  END IF;

  -- Test data (as the server).
  UPDATE public.profiles
  SET membership_status = 'active', membership_type = 'sitter', membership_expiry = now() + interval '1 year', membership_payment_failed_at = NULL
  WHERE id = v_nomad;
  UPDATE public.profiles
  SET membership_status = 'active', membership_type = 'owner', membership_expiry = now() + interval '1 year',
      membership_payment_failed_at = NULL, id_verified = true
  WHERE id = v_owner;
  UPDATE public.sitter_profiles SET is_visible = true, is_active = true WHERE user_id = v_nomad;

  INSERT INTO public.listings (owner_user_id, title, status, city, country, owner_declaration_accepted_at)
  VALUES (v_owner, 'F1b sample listing', 'published', 'Testville F1b', 'Testland', now())
  RETURNING id INTO v_listing;
  UPDATE public.owner_profiles SET is_active = true WHERE user_id = v_owner;

  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 40, current_date + 45) RETURNING id INTO r_1;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 50, current_date + 55) RETURNING id INTO r_2;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 60, current_date + 65) RETURNING id INTO r_3;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 70, current_date + 75) RETURNING id INTO r_4;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 80, current_date + 85) RETURNING id INTO r_5;
  -- The Nomad's confirmed sit on this listing.
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date + 20, current_date + 25, 'booked') RETURNING id INTO r_c;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, r_c, v_owner, v_nomad, 'confirmed', now());

  -- The chat between the Pet Parent and the Nomad, and one between the other
  -- member and the Nomad (reused if they already exist).
  SELECT c.id INTO v_conv FROM public.conversations c
  WHERE (c.owner_user_id, c.sitter_user_id) IN ((v_owner, v_nomad), (v_nomad, v_owner))
  ORDER BY (c.listing_id = v_listing) DESC NULLS LAST, c.created_at LIMIT 1;
  IF v_conv IS NULL THEN
    INSERT INTO public.conversations (owner_user_id, sitter_user_id, listing_id, conversation_type)
    VALUES (v_owner, v_nomad, v_listing, 'listing') RETURNING id INTO v_conv;
  END IF;
  SELECT c.id INTO v_conv_other FROM public.conversations c
  WHERE (c.owner_user_id, c.sitter_user_id) IN ((v_other, v_nomad), (v_nomad, v_other))
  ORDER BY c.created_at LIMIT 1;
  IF v_conv_other IS NULL THEN
    INSERT INTO public.conversations (owner_user_id, sitter_user_id, listing_id, conversation_type)
    VALUES (v_other, v_nomad, NULL, 'direct') RETURNING id INTO v_conv_other;
  END IF;

  -- ── a) One invitation for 2 ranges in ONE insert: 1 notification ───────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, message)
  VALUES (v_listing, r_1, v_owner, v_nomad, 'pending', 'F1b test 2099 my invitation message'),
         (v_listing, r_2, v_owner, v_nomad, 'pending', 'F1b test 2099 my invitation message');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*), max(message) INTO v_n, v_text FROM public.notifications
  WHERE user_id = v_nomad AND type = 'invite' AND data->>'listing_id' = v_listing::text;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (a) inviting for 2 ranges gave the Nomad % invite notifications, not 1', v_n; END IF;
  IF v_text NOT LIKE '%2 date ranges%' THEN RAISE EXCEPTION 'FAIL: (a) the invite notification does not say "2 date ranges"'; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'invite' AND data->>'listing_id' = v_listing::text;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (a) the Pet Parent was notified of their own invitation'; END IF;

  -- ── b) The invitation note: in the chat, no alert, never twice ─────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.post_invite_note(v_conv, v_nomad, v_listing);
  PERFORM public.post_invite_note(v_conv, v_nomad, v_listing);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.messages
  WHERE conversation_id = v_conv AND sender_user_id = v_owner AND body = v_note AND created_at >= now();
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (b) the invitation note is in the chat % times, not once', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE user_id = v_nomad AND type = 'new_message' AND data->>'conversation_id' = v_conv::text AND created_at >= now();
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (b) the invitation note gave the Nomad % new_message notifications, not 0', v_n; END IF;

  -- ── c) A normal chat message still alerts once ─────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.messages (conversation_id, sender_user_id, body) VALUES (v_conv, v_owner, 'F1b test 2099 a normal message');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE user_id = v_nomad AND type = 'new_message' AND data->>'conversation_id' = v_conv::text AND created_at >= now();
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (c) a normal message gave the Nomad % new_message notifications, not 1', v_n; END IF;

  -- ── d) post_invite_note refuses everyone else ──────────────────────────
  -- The Nomad calling it.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_raised := false;
  BEGIN
    PERFORM public.post_invite_note(v_conv, v_owner, v_listing);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  RESET ROLE;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: (d) the Nomad could post the invitation note'; END IF;
  -- The Pet Parent, for a chat that isn't theirs.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_raised := false;
  BEGIN
    PERFORM public.post_invite_note(v_conv_other, v_nomad, v_listing);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  RESET ROLE;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: (d) the Pet Parent could post into a chat that is not theirs'; END IF;
  -- The Pet Parent, with no recent invitation for that member.
  SET LOCAL ROLE authenticated;
  v_raised := false;
  BEGIN
    PERFORM public.post_invite_note(v_conv, v_other, v_listing);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: (d) the note was posted with no recent invitation'; END IF;
  SELECT count(*) INTO v_n FROM public.messages WHERE body = v_note AND created_at >= now();
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (d) a refused call still posted a note (% notes)', v_n; END IF;

  -- ── e) A Nomad with a confirmed sit applies for 2 more ranges at once ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, status, message)
  VALUES (v_listing, r_3, v_nomad, 'applied', 'F1b test 2099 my application message'),
         (v_listing, r_4, v_nomad, 'applied', 'F1b test 2099 my application message');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.applications WHERE listing_id = v_listing AND sitter_user_id = v_nomad AND sit_dates_id IN (r_3, r_4);
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL: (e) the Nomad with a confirmed sit could not apply for 2 more ranges (% rows)', v_n; END IF;
  SELECT count(*), max(message) INTO v_n, v_text FROM public.notifications
  WHERE user_id = v_owner AND type = 'new_application' AND data->>'listing_id' = v_listing::text;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (e) applying for 2 ranges gave the Pet Parent % notifications, not 1', v_n; END IF;
  IF v_text NOT LIKE '%2 date ranges%' THEN RAISE EXCEPTION 'FAIL: (e) the application notification does not say "2 date ranges"'; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND type = 'new_application' AND data->>'listing_id' = v_listing::text;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (e) the Nomad was notified of their own applications'; END IF;

  -- ── f) One application: the old text. Withdrawing: one notification ───
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, status, message)
  VALUES (v_listing, r_5, v_nomad, 'applied', 'F1b test 2099 one more application') RETURNING id INTO v_app5;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*), max(message) INTO v_n, v_text FROM public.notifications
  WHERE user_id = v_owner AND type = 'new_application' AND dedupe_key = 'new_application:' || v_app5;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (f) one application gave the Pet Parent % notifications, not 1', v_n; END IF;
  IF v_text NOT LIKE '% applied for your sit in Testville F1b%' OR v_text LIKE '%date ranges%' THEN
    RAISE EXCEPTION 'FAIL: (f) one application does not use the old wording';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.applications SET status = 'withdrawn' WHERE id = v_app5;
  UPDATE public.applications SET status = 'withdrawn' WHERE id = v_app5;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'application_withdrawn' AND dedupe_key = 'application_withdrawn:' || v_app5;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (f) withdrawing gave the Pet Parent % notifications, not 1', v_n; END IF;

  -- Accepting an invitation (accept_invite, one row) still notifies once.
  SELECT id INTO v_invite1 FROM public.sitter_invites WHERE listing_id = v_listing AND sit_dates_id = r_1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.accept_invite(v_invite1, NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications n
  JOIN public.applications a ON n.dedupe_key = 'new_application:' || a.id
  WHERE n.user_id = v_owner AND a.listing_id = v_listing AND a.sit_dates_id = r_1;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (f) accepting an invitation gave the Pet Parent % notifications, not 1', v_n; END IF;

  -- ── g) No member-written text in any notification ──────────────────────
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE created_at >= now()
    AND (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%F1b test 2099%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (g) % notifications contain text a member wrote', v_n; END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;

-- Leftover check (run after the test): supabase/checks/batch_f1b_leftover.sql.
-- Every count must be 0.
