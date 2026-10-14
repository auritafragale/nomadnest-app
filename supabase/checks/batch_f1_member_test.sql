-- Batch F1: behaviour test, acting as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Every action is done as the member who does it in the app. Each one must
-- create exactly one notification, for the right member, and none for the
-- member who did it; doing it again must not add a second one; and no
-- notification may contain the text members wrote ("F1 test 2099 ...").
-- Needs: a non-admin, non-Founding Nomad (with a Nomad profile), a
-- non-admin, non-Founding member with no listing (given a temporary one),
-- and at least one admin.

DO $$
DECLARE
  v_owner uuid;
  v_nomad uuid;
  v_admin uuid;
  v_listing uuid;
  r_1 uuid; r_2 uuid; r_3 uuid; r_4 uuid; r_5 uuid; r_6 uuid; r_7 uuid; r_8 uuid;
  s_3 uuid; s_4 uuid; s_6 uuid; s_7 uuid; s_8 uuid;
  v_app uuid;
  v_app2 uuid;
  v_invite uuid;
  v_req uuid;
  v_req2 uuid;
  v_checkin uuid;
  v_idv uuid;
  v_idv2 uuid;
  v_report uuid;
  v_n integer;
  v_admins integer;
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
  SELECT p.id INTO v_admin FROM public.profiles p WHERE p.is_admin IS TRUE ORDER BY p.created_at LIMIT 1;
  IF v_nomad IS NULL OR v_owner IS NULL OR v_admin IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a non-admin, non-Founding Nomad, a non-admin, non-Founding member with no listing, and an admin';
  END IF;
  SELECT count(*) INTO v_admins FROM public.profiles WHERE is_admin IS TRUE AND id <> v_nomad;

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
  VALUES (v_owner, 'F1 sample listing', 'published', 'Testville', 'Testland', now())
  RETURNING id INTO v_listing;
  UPDATE public.owner_profiles SET is_active = true WHERE user_id = v_owner;

  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 40, current_date + 45) RETURNING id INTO r_1;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 50, current_date + 55) RETURNING id INTO r_2;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date + 60, current_date + 65, 'booked') RETURNING id INTO r_3;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date + 70, current_date + 75, 'booked') RETURNING id INTO r_4;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 80, current_date + 85) RETURNING id INTO r_5;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date + 90, current_date + 95, 'booked') RETURNING id INTO r_6;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date + 100, current_date + 105, 'booked') RETURNING id INTO r_7;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, current_date - 1, current_date + 4, 'booked') RETURNING id INTO r_8;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, r_3, v_owner, v_nomad, 'confirmed', now()) RETURNING id INTO s_3;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, r_4, v_owner, v_nomad, 'confirmed', now()) RETURNING id INTO s_4;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, r_6, v_owner, v_nomad, 'confirmed', now()) RETURNING id INTO s_6;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, r_7, v_owner, v_nomad, 'confirmed', now()) RETURNING id INTO s_7;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, r_8, v_owner, v_nomad, 'in_progress', now() - interval '2 days') RETURNING id INTO s_8;

  -- ── 1. Applying ───────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, status, message)
  VALUES (v_listing, r_1, v_nomad, 'applied', 'F1 test 2099 my application message') RETURNING id INTO v_app;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'new_application' AND dedupe_key = 'new_application:' || v_app;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: applying gave the Pet Parent % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND dedupe_key = 'new_application:' || v_app;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Nomad was notified of their own application'; END IF;

  -- ── 2. Withdrawing (and doing it again) ───────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.applications SET status = 'withdrawn' WHERE id = v_app;
  UPDATE public.applications SET status = 'withdrawn' WHERE id = v_app;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'application_withdrawn' AND dedupe_key = 'application_withdrawn:' || v_app;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: withdrawing (twice) gave the Pet Parent % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND dedupe_key = 'application_withdrawn:' || v_app;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Nomad was notified of their own withdrawal'; END IF;

  -- ── 3. Inviting ───────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, message)
  VALUES (v_listing, r_2, v_owner, v_nomad, 'pending', 'F1 test 2099 my invitation message') RETURNING id INTO v_invite;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND type = 'invite' AND dedupe_key = 'invite:' || v_invite;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: inviting gave the Nomad % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND dedupe_key = 'invite:' || v_invite;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Pet Parent was notified of their own invitation'; END IF;

  -- ── 4. Cancelling a sit, from each side ───────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.sits SET status = 'cancelled' WHERE id = s_3;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.sits SET status = 'cancelled' WHERE id = s_4;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND type = 'sit_cancelled' AND dedupe_key = 'sit_cancelled:' || s_3;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the Pet Parent cancelling gave the Nomad % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND dedupe_key = 'sit_cancelled:' || s_3;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Pet Parent was notified of their own cancellation'; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'sit_cancelled' AND dedupe_key = 'sit_cancelled:' || s_4;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the Nomad cancelling gave the Pet Parent % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND dedupe_key = 'sit_cancelled:' || s_4;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Nomad was notified of their own cancellation'; END IF;

  -- ── 5. Changing listing dates when there are applicants ──────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, status, message)
  VALUES (v_listing, r_5, v_nomad, 'applied', 'F1 test 2099 second application') RETURNING id INTO v_app2;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.sit_dates SET start_date = current_date + 81, end_date = current_date + 86 WHERE id = r_5;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND type = 'listing_dates_changed' AND dedupe_key LIKE 'listing_dates_changed:' || r_5 || ':%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: changing dates gave the applicant % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'listing_dates_changed' AND dedupe_key LIKE 'listing_dates_changed:' || r_5 || ':%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Pet Parent was notified of their own date change'; END IF;

  -- ── 6. Proposing, accepting and declining new dates ───────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.sit_reschedule_requests (sit_id, proposed_start_date, proposed_end_date, requested_by, note)
  VALUES (s_6, current_date + 91, current_date + 96, v_owner, 'F1 test 2099 my reschedule note') RETURNING id INTO v_req;
  INSERT INTO public.sit_reschedule_requests (sit_id, proposed_start_date, proposed_end_date, requested_by, note)
  VALUES (s_7, current_date + 101, current_date + 106, v_owner, 'F1 test 2099 another note') RETURNING id INTO v_req2;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND type = 'sit_reschedule_proposed' AND dedupe_key = 'sit_reschedule_proposed:' || v_req;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: proposing new dates gave the Nomad % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND dedupe_key = 'sit_reschedule_proposed:' || v_req;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Pet Parent was notified of their own proposal'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.respond_to_sit_reschedule(v_req, true);
  PERFORM public.respond_to_sit_reschedule(v_req2, false);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'sit_reschedule_accepted' AND dedupe_key = 'sit_reschedule_accepted:' || v_req;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: accepting new dates gave the Pet Parent % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'sit_reschedule_declined' AND dedupe_key = 'sit_reschedule_declined:' || v_req2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: declining new dates gave the Pet Parent % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad
    AND dedupe_key IN ('sit_reschedule_accepted:' || v_req, 'sit_reschedule_declined:' || v_req2);
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Nomad was notified of their own answer'; END IF;

  -- ── 7. Posting a daily update ─────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.sit_checkins (sit_id, author_user_id, kind, chips, note)
  VALUES (s_8, v_nomad, 'daily_update', ARRAY['fed', 'walked'], 'F1 test 2099 my daily update text') RETURNING id INTO v_checkin;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'sit_checkin' AND dedupe_key = 'sit_checkin:' || v_checkin;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: a daily update gave the Pet Parent % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND dedupe_key = 'sit_checkin:' || v_checkin;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Nomad was notified of their own update'; END IF;

  -- ── 8. An admin approving and rejecting an ID check ───────────────────
  INSERT INTO public.manual_id_verifications (user_id, status, notes) VALUES (v_nomad, 'pending', 'F1 test 2099 first') RETURNING id INTO v_idv;
  INSERT INTO public.manual_id_verifications (user_id, status, notes) VALUES (v_nomad, 'pending', 'F1 test 2099 second') RETURNING id INTO v_idv2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_decide_id_verification(v_idv, 'approved', NULL);
  PERFORM public.admin_decide_id_verification(v_idv2, 'rejected', 'Photo unclear');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND type = 'id_verification_approved' AND dedupe_key = 'id_verification_approved:' || v_idv;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: approving an ID check gave the member % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND type = 'id_verification_rejected' AND dedupe_key = 'id_verification_rejected:' || v_idv2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: rejecting an ID check gave the member % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_admin
    AND dedupe_key IN ('id_verification_approved:' || v_idv, 'id_verification_rejected:' || v_idv2);
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the admin was notified of their own decision'; END IF;

  -- ── 9. A new report, for the founders ─────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, details)
  VALUES (v_nomad, 'user', v_owner, 'other', 'F1 test 2099 my report details') RETURNING id INTO v_report;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE type = 'new_report' AND dedupe_key = 'new_report:' || v_report;
  IF v_n <> v_admins THEN RAISE EXCEPTION 'FAIL: a report gave % founder notifications, expected one per admin (%)', v_n, v_admins; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id IN (v_nomad, v_owner) AND dedupe_key = 'new_report:' || v_report;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the reporter or the reported member was notified about the report'; END IF;

  -- ── 10. The same event twice never notifies twice ─────────────────────
  PERFORM public.notify_member(v_owner, 'new_application', 'x', 'y', '/applications', '{}'::jsonb, 'new_application:' || v_app, NULL, false);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND dedupe_key = 'new_application:' || v_app;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the same event created a second notification'; END IF;

  -- ── 11. No member-written text in any notification ────────────────────
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE created_at >= now()
    AND (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%F1 test 2099%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: % notifications contain text a member wrote', v_n; END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;

-- Leftover check (run after the test): supabase/checks/batch_f1_leftover.sql.
-- Every count must be 0.
