-- Batch F1e: behaviour test, acting as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Text the test members "write" starts with "F1e test 2099" and must never
-- reach a notification. The test listing is "F1e sample listing" in
-- "Testville F1e". Needs a non-admin, non-Founding Nomad (with a Nomad
-- profile) and a non-admin, non-Founding member with no listing (given a
-- temporary one).
--
-- a) The Nomad accepts new dates: the application (and the invitation it
--    came from) moves with the sit, and the old range is closed.
-- b) Cancelling the moved sit cancels the application.
-- c) The Pet Parent can invite the same Nomad again where their application
--    ended.
-- d) One alert per action, for the other member only, and no member text.

DO $$
DECLARE
  v_owner uuid;
  v_nomad uuid;
  v_listing uuid;
  r_1 uuid;
  r_new uuid;
  v_inv_a uuid;
  v_inv_b uuid;
  v_inv_c uuid;
  v_app uuid;
  v_sit uuid;
  v_req uuid;
  v_json jsonb;
  v_owner_n integer;
  v_nomad_n integer;
  v_n integer;
  v_text text;
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
  IF v_nomad IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a non-admin, non-Founding Nomad and a non-admin, non-Founding member with no listing';
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
  VALUES (v_owner, 'F1e sample listing', 'published', 'Testville F1e', 'Testland', now())
  RETURNING id INTO v_listing;
  UPDATE public.owner_profiles SET is_active = true WHERE user_id = v_owner;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 40, current_date + 45) RETURNING id INTO r_1;

  -- The Pet Parent invites; the Nomad declines; the Pet Parent invites again
  -- and the Nomad accepts the invitation (it becomes their application).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, message)
  VALUES (v_listing, r_1, v_owner, v_nomad, 'pending', 'F1e test 2099 first invitation') RETURNING id INTO v_inv_a;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.sitter_invites SET status = 'declined' WHERE id = v_inv_a;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, message)
  VALUES (v_listing, r_1, v_owner, v_nomad, 'pending', 'F1e test 2099 second invitation') RETURNING id INTO v_inv_b;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_app := public.accept_invite(v_inv_b, 'F1e test 2099 my application');
  RESET ROLE;

  -- The Pet Parent confirmed the Nomad (as the server, like accept_application).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.applications SET status = 'accepted' WHERE id = v_app;
  UPDATE public.sit_dates SET status = 'booked' WHERE id = r_1;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, r_1, v_owner, v_nomad, 'confirmed', now()) RETURNING id INTO v_sit;

  -- ── Proposing new dates: one alert, for the Nomad ─────────────────────
  SELECT count(*) INTO v_owner_n FROM public.notifications WHERE user_id = v_owner;
  SELECT count(*) INTO v_nomad_n FROM public.notifications WHERE user_id = v_nomad;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.sit_reschedule_requests (sit_id, proposed_start_date, proposed_end_date, requested_by, note)
  VALUES (v_sit, current_date + 50, current_date + 53, v_owner, 'F1e test 2099 reschedule note') RETURNING id INTO v_req;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_nomad) <> v_nomad_n + 1 THEN
    RAISE EXCEPTION 'FAIL: proposing new dates did not give the Nomad exactly one alert';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_owner) <> v_owner_n THEN
    RAISE EXCEPTION 'FAIL: the Pet Parent was alerted about their own proposal';
  END IF;

  -- ── a) The Nomad accepts: the application moves with the sit ─────────
  SELECT count(*) INTO v_owner_n FROM public.notifications WHERE user_id = v_owner;
  SELECT count(*) INTO v_nomad_n FROM public.notifications WHERE user_id = v_nomad;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_json := public.respond_to_sit_reschedule(v_req, true);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: (a) accepting new dates failed: % %', SQLSTATE, SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r_new := (v_json->>'new_sit_dates_id')::uuid;
  IF r_new IS NULL OR (SELECT sit_dates_id FROM public.sits WHERE id = v_sit) IS DISTINCT FROM r_new THEN
    RAISE EXCEPTION 'FAIL: (a) the sit did not move to the new range';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applications WHERE id = v_app AND sit_dates_id = r_new AND status = 'accepted') THEN
    RAISE EXCEPTION 'FAIL: (a) the accepted application did not move with the sit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sitter_invites WHERE id = v_inv_b AND sit_dates_id = r_new AND status = 'applied') THEN
    RAISE EXCEPTION 'FAIL: (a) the invitation the sit came from did not move with it';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sitter_invites WHERE id = v_inv_a AND sit_dates_id = r_1 AND status = 'declined') THEN
    RAISE EXCEPTION 'FAIL: (a) the earlier, declined invitation changed';
  END IF;
  -- The old range is still referred to (the declined invitation), so it is
  -- closed, not deleted, and no longer offered.
  SELECT status::text INTO v_text FROM public.sit_dates WHERE id = r_1;
  IF v_text IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'FAIL: (a) the old range is % (expected closed)', COALESCE(v_text, 'gone');
  END IF;
  IF (SELECT status::text FROM public.sit_dates WHERE id = r_new) <> 'booked' THEN
    RAISE EXCEPTION 'FAIL: (a) the new range is not booked';
  END IF;
  -- What Browse, the listing page, Apply and Invite list: open ranges only.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_n FROM public.sit_dates WHERE listing_id = v_listing AND status = 'open';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (a) a range of the moved sit is still offered'; END IF;
  -- One alert: the Pet Parent hears the new dates were accepted.
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_owner) <> v_owner_n + 1
     OR NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_owner AND dedupe_key = 'sit_reschedule_accepted:' || v_req) THEN
    RAISE EXCEPTION 'FAIL: (a) accepting new dates did not give the Pet Parent exactly one alert';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_nomad) <> v_nomad_n THEN
    RAISE EXCEPTION 'FAIL: (a) the Nomad was alerted about their own answer';
  END IF;

  -- ── b) Cancelling the moved sit cancels the application ──────────────
  SELECT count(*) INTO v_nomad_n FROM public.notifications WHERE user_id = v_nomad;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.sits SET status = 'cancelled' WHERE id = v_sit;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT status::text INTO v_text FROM public.applications WHERE id = v_app;
  IF v_text IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'FAIL: (b) cancelling the moved sit left the application %', v_text;
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_nomad) <> v_nomad_n + 1
     OR NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_nomad AND dedupe_key = 'sit_cancelled:' || v_sit) THEN
    RAISE EXCEPTION 'FAIL: (b) cancelling did not give the Nomad exactly one alert';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_owner AND dedupe_key = 'sit_cancelled:' || v_sit) THEN
    RAISE EXCEPTION 'FAIL: (b) the Pet Parent was alerted about their own cancellation';
  END IF;

  -- ── c) The Pet Parent can invite the Nomad again for those dates ─────
  -- (The cancel flow reopens the dates; the earlier invitation is still
  -- marked "applied", but its application has ended.)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.sit_dates SET status = 'open' WHERE id = r_new;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF EXISTS (SELECT 1 FROM public.applications a
             WHERE a.sit_dates_id = r_new AND a.sitter_user_id = v_nomad
               AND (a.status IN ('applied', 'shortlisted')
                    OR (a.status = 'accepted' AND EXISTS (SELECT 1 FROM public.sits s WHERE s.sit_dates_id = r_new
                                                          AND s.status IN ('confirmed', 'in_progress'))))) THEN
    RAISE EXCEPTION 'FAIL: (c) the Nomad still has a live application on the reopened dates';
  END IF;
  SELECT count(*) INTO v_owner_n FROM public.notifications WHERE user_id = v_owner;
  SELECT count(*) INTO v_nomad_n FROM public.notifications WHERE user_id = v_nomad;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, message)
    VALUES (v_listing, r_new, v_owner, v_nomad, 'pending', 'F1e test 2099 invitation again') RETURNING id INTO v_inv_c;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: (c) inviting the Nomad again where their application ended was refused: % %', SQLSTATE, SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_nomad) <> v_nomad_n + 1 THEN
    RAISE EXCEPTION 'FAIL: (c) inviting again did not give the Nomad exactly one alert';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_owner) <> v_owner_n THEN
    RAISE EXCEPTION 'FAIL: (c) the Pet Parent was alerted about their own invitation';
  END IF;

  -- ── d) No member text in any alert ───────────────────────────────────
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE user_id IN (v_owner, v_nomad)
    AND (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%F1e test 2099%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (d) % alert(s) carried text a member wrote', v_n; END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;
