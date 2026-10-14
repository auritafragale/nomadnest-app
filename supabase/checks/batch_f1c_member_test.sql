-- Batch F1c: behaviour test, acting as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Every action is done as the member who does it in the app. Text the test
-- members "write" starts with "F1c test 2099" and must never reach a
-- notification. The test listing is "F1c sample listing" (no marker: a
-- listing title may rightly appear in alerts) in "Testville F1c".
-- Needs: a non-admin, non-Founding Nomad (with a Nomad profile), a non-admin,
-- non-Founding member with no listing (given a temporary one), and an admin.

DO $$
DECLARE
  v_owner uuid;
  v_nomad uuid;
  v_admin uuid;
  v_listing uuid;
  r_1 uuid; r_2 uuid; r_3 uuid;
  v_inv1 uuid;
  v_inv2 uuid;
  v_inv3 uuid;
  v_app uuid;
  v_idv uuid;
  v_idv2 uuid;
  v_n integer;
  v_text text;
  v_raised boolean;
  v_stmt text;
  v_own text;
  v_other_folder constant text := '00000000-0000-0000-0000-000000000000/draft/';
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);

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
  v_own := v_nomad::text || '/draft/';

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
  VALUES (v_owner, 'F1c sample listing', 'published', 'Testville F1c', 'Testland', now())
  RETURNING id INTO v_listing;
  UPDATE public.owner_profiles SET is_active = true WHERE user_id = v_owner;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 40, current_date + 45) RETURNING id INTO r_1;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 50, current_date + 55) RETURNING id INTO r_2;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, current_date + 60, current_date + 65) RETURNING id INTO r_3;

  -- ── a) A decline tells the Pet Parent, once ────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, message)
  VALUES (v_listing, r_1, v_owner, v_nomad, 'pending', 'F1c test 2099 invitation one') RETURNING id INTO v_inv1;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.sitter_invites SET status = 'viewed' WHERE id = v_inv1;
  UPDATE public.sitter_invites SET status = 'declined' WHERE id = v_inv1;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*), max(message) INTO v_n, v_text FROM public.notifications
  WHERE user_id = v_owner AND type = 'invite_declined' AND data->>'invite_id' = v_inv1::text;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (a) a decline gave the Pet Parent % invite_declined notifications, not 1', v_n; END IF;
  IF v_text NOT LIKE '% can''t make your sit in Testville F1c, %' THEN
    RAISE EXCEPTION 'FAIL: (a) the decline notification has unexpected words';
  END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND type = 'invite_declined';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (a) the Nomad was notified of their own decline'; END IF;

  -- ── b) Re-invite after a decline works; a second live one doesn't ─────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, message)
    VALUES (v_listing, r_1, v_owner, v_nomad, 'pending', 'F1c test 2099 invitation again') RETURNING id INTO v_inv2;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: (b) re-inviting a declined range was refused: % %', SQLSTATE, SQLERRM;
  END;
  v_raised := false;
  BEGIN
    INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status)
    VALUES (v_listing, r_1, v_owner, v_nomad, 'pending');
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  RESET ROLE;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: (b) a second live invitation for the same range was allowed'; END IF;

  -- ── c) The Nomad may change only the status, along the allowed steps ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_stmt IN ARRAY ARRAY[
    format('UPDATE public.sitter_invites SET listing_id = %L WHERE id = %L', gen_random_uuid(), v_inv2),
    format('UPDATE public.sitter_invites SET owner_user_id = %L WHERE id = %L', v_nomad, v_inv2),
    format('UPDATE public.sitter_invites SET sit_dates_id = %L WHERE id = %L', r_3, v_inv2),
    format('UPDATE public.sitter_invites SET message = %L WHERE id = %L', 'F1c test 2099 changed', v_inv2),
    format('UPDATE public.sitter_invites SET status = %L WHERE id = %L', 'applied', v_inv2)
  ] LOOP
    v_raised := false;
    BEGIN
      EXECUTE v_stmt;
    EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: (c) the Nomad could run: %', v_stmt; END IF;
  END LOOP;
  -- Undo a decline (the Invitations page offers it): r_2.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status)
  VALUES (v_listing, r_2, v_owner, v_nomad, 'pending') RETURNING id INTO v_inv3;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.sitter_invites SET status = 'declined' WHERE id = v_inv3;
  UPDATE public.sitter_invites SET status = 'viewed' WHERE id = v_inv3;
  UPDATE public.sitter_invites SET status = 'declined' WHERE id = v_inv3;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  IF NOT EXISTS (SELECT 1 FROM public.sitter_invites WHERE id = v_inv2 AND status = 'pending' AND listing_id = v_listing
                   AND owner_user_id = v_owner AND sit_dates_id = r_1 AND message = 'F1c test 2099 invitation again') THEN
    RAISE EXCEPTION 'FAIL: (c) the invitation was changed';
  END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'invite_declined' AND data->>'invite_id' = v_inv3::text;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (c) decline, undo, decline gave % notifications, not 1', v_n; END IF;

  -- ── d) accept_invite still works ───────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_app := public.accept_invite(v_inv2, NULL);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: (d) accept_invite failed: % %', SQLSTATE, SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  IF NOT EXISTS (SELECT 1 FROM public.sitter_invites WHERE id = v_inv2 AND status = 'applied') THEN
    RAISE EXCEPTION 'FAIL: (d) the invitation is not applied after accepting';
  END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_owner AND type = 'new_application' AND dedupe_key = 'new_application:' || v_app;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (d) accepting gave the Pet Parent % new_application notifications, not 1', v_n; END IF;

  -- ── e) ID checks: members send pending rows in their own folder only ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_stmt IN ARRAY ARRAY[
    format('INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path, status) VALUES (%L, %L, %L, %L)',
           v_nomad, v_own || 'id-1.jpg', v_own || 'selfie-1.jpg', 'approved'),
    format('INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path) VALUES (%L, %L, %L)',
           v_nomad, v_other_folder || 'id-1.jpg', v_own || 'selfie-1.jpg'),
    format('INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path) VALUES (%L, %L, %L)',
           v_nomad, v_own || 'id-1.jpg', v_other_folder || 'selfie-1.jpg'),
    format('INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path, notes) VALUES (%L, %L, %L, %L)',
           v_nomad, v_own || 'id-1.jpg', v_own || 'selfie-1.jpg', 'F1c test 2099 note')
  ] LOOP
    v_raised := false;
    BEGIN
      EXECUTE v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: (e) the member could run: %', v_stmt; END IF;
  END LOOP;
  BEGIN
    INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path)
    VALUES (v_nomad, v_own || 'id-1.jpg', v_own || 'selfie-1.jpg') RETURNING id INTO v_idv;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: (e) a normal ID submission was refused: % %', SQLSTATE, SQLERRM;
  END;

  -- ── f) ... and change only the two paths, while pending ───────────────
  FOREACH v_stmt IN ARRAY ARRAY[
    format('UPDATE public.manual_id_verifications SET notes = %L WHERE id = %L', 'F1c test 2099 note', v_idv),
    format('UPDATE public.manual_id_verifications SET status = %L WHERE id = %L', 'approved', v_idv),
    format('UPDATE public.manual_id_verifications SET id_photo_path = %L WHERE id = %L', v_other_folder || 'id-2.jpg', v_idv)
  ] LOOP
    v_raised := false;
    BEGIN
      EXECUTE v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: (f) the member could run: %', v_stmt; END IF;
  END LOOP;
  BEGIN
    UPDATE public.manual_id_verifications SET id_photo_path = v_own || 'id-2.jpg' WHERE id = v_idv;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: (f) replacing a document on a pending check was refused: % %', SQLSTATE, SQLERRM;
  END;
  INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path)
  VALUES (v_nomad, v_own || 'id-3.jpg', v_own || 'selfie-3.jpg') RETURNING id INTO v_idv2;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  IF NOT EXISTS (SELECT 1 FROM public.manual_id_verifications WHERE id = v_idv AND status = 'pending' AND notes IS NULL
                   AND id_photo_path = v_own || 'id-2.jpg') THEN
    RAISE EXCEPTION 'FAIL: (f) the ID check is not as the member left it';
  END IF;

  -- ── g) The admin approve / reject flow still works and notifies once ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_decide_id_verification(v_idv, 'approved', NULL);
  PERFORM public.admin_decide_id_verification(v_idv2, 'rejected', 'Photo unclear');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND type = 'id_verification_approved' AND dedupe_key = 'id_verification_approved:' || v_idv;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (g) approving gave % notifications, not 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad AND type = 'id_verification_rejected' AND dedupe_key = 'id_verification_rejected:' || v_idv2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (g) rejecting gave % notifications, not 1', v_n; END IF;
  -- A decided check can't be changed by the member any more.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.manual_id_verifications SET id_photo_path = v_own || 'id-4.jpg' WHERE id = v_idv2;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  IF EXISTS (SELECT 1 FROM public.manual_id_verifications WHERE id = v_idv2 AND id_photo_path = v_own || 'id-4.jpg') THEN
    RAISE EXCEPTION 'FAIL: (g) the member changed a reviewed ID check';
  END IF;

  -- ── h) No member-written text in any notification ─────────────────────
  SELECT count(*) INTO v_n FROM public.notifications
  WHERE created_at >= now()
    AND (title || ' ' || message || ' ' || COALESCE(data::text, '')) ILIKE '%F1c test 2099%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (h) % notifications contain text a member wrote', v_n; END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;

-- Leftover check (run after the test): supabase/checks/batch_f1c_leftover.sql.
