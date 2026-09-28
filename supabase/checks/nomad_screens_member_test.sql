-- Stage 2 (Nomad screens): behaviour test as a signed-out visitor and as members.
-- Runs inside a transaction and ROLLS BACK: nothing is changed.
--
-- Needs one published listing and two other members. Result: the last query
-- returns "PASS"; anything unexpected stops with an error starting "FAIL:".

BEGIN;

DO $$
DECLARE
  v_owner uuid;
  v_listing uuid;
  v_other_listing uuid;
  v_dates uuid;
  v_sitter uuid;
  v_stranger uuid;
  v_invite uuid;
  v_app uuid;
  v_json jsonb;
  v_n integer;
  v_status text;
  v_stmt text;
  i integer;
BEGIN
  -- ── Fixtures ─────────────────────────────────────────────────────────────
  SELECT l.id, l.owner_user_id INTO v_listing, v_owner
  FROM public.listings l WHERE l.status = 'published' AND l.owner_user_id IS NOT NULL
  ORDER BY l.created_at LIMIT 1;
  IF v_listing IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a published listing';
  END IF;
  SELECT id INTO v_other_listing FROM public.listings WHERE owner_user_id IS DISTINCT FROM v_owner LIMIT 1;

  -- An open, upcoming date range on it (added for the test, rolled back).
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status)
  VALUES (v_listing, current_date + 60, current_date + 67, 'open')
  RETURNING id INTO v_dates;

  SELECT p.id INTO v_sitter FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id <> v_owner
    AND EXISTS (SELECT 1 FROM public.sitter_profiles sp WHERE sp.user_id = p.id)
  ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO v_stranger FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id NOT IN (v_owner, v_sitter)
  ORDER BY p.created_at LIMIT 1;
  IF v_sitter IS NULL OR v_stranger IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a Nomad and one more member besides the listing owner';
  END IF;
  UPDATE public.sitter_profiles SET is_visible = true, is_active = true WHERE user_id = v_sitter;
  -- Start the day with no invites from this owner, so the limit test is exact.
  DELETE FROM public.sitter_invites WHERE owner_user_id = v_owner AND created_at > now() - interval '24 hours';

  -- ── Signed-out visitor: no member tables ─────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  FOREACH v_stmt IN ARRAY ARRAY[
    'SELECT 1 FROM public.conversations LIMIT 1',
    'SELECT 1 FROM public.messages LIMIT 1',
    'SELECT 1 FROM public.sitter_invites LIMIT 1',
    'SELECT 1 FROM public.user_roles LIMIT 1',
    'SELECT 1 FROM public.sitter_availability LIMIT 1'
  ] LOOP
    BEGIN
      EXECUTE v_stmt;
      RAISE EXCEPTION 'FAIL: a signed-out visitor could run: %', v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RESET ROLE;

  -- ── Invitations: own listing and an open date only ───────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF v_other_listing IS NOT NULL THEN
    BEGIN
      INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id)
      VALUES (v_other_listing, v_dates, v_owner, v_sitter);
      RAISE EXCEPTION 'FAIL: a Pet Parent could invite to someone else''s listing';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END IF;
  INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id, message)
  VALUES (v_listing, v_dates, v_owner, v_sitter, 'Member test')
  RETURNING id INTO v_invite;
  RESET ROLE;

  -- 20 a day: 19 more are fine, the 21st is refused.
  FOR i IN 1..19 LOOP
    INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id)
    VALUES (v_listing, v_dates, v_owner, v_stranger);
  END LOOP;
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.sitter_invites (listing_id, sit_dates_id, owner_user_id, sitter_user_id)
    VALUES (v_listing, v_dates, v_owner, v_stranger);
    RAISE EXCEPTION 'FAIL: a Pet Parent could send a 21st invitation in a day';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'You can send up to 20 invitations a day%' THEN
      RAISE EXCEPTION 'FAIL: unexpected error for the invite limit: %', SQLERRM;
    END IF;
  END;
  RESET ROLE;

  -- ── Accepting: only the invited Nomad; it becomes their application ──────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.accept_invite(v_invite);
    RAISE EXCEPTION 'FAIL: another member could accept someone''s invitation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sitter, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_app := public.accept_invite(v_invite);
  RESET ROLE;
  SELECT status INTO v_status FROM public.sitter_invites WHERE id = v_invite;
  IF v_status <> 'applied' THEN
    RAISE EXCEPTION 'FAIL: the invitation is % after accepting (expected applied)', v_status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applications WHERE id = v_app AND sitter_user_id = v_sitter
                 AND listing_id = v_listing AND sit_dates_id = v_dates AND status = 'applied') THEN
    RAISE EXCEPTION 'FAIL: accepting didn''t create the Nomad''s application';
  END IF;

  -- ── Availability ─────────────────────────────────────────────────────────
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.sitter_availability (sitter_user_id, start_date, end_date)
    VALUES (v_sitter, current_date + 10, current_date + 12);
    RAISE EXCEPTION 'FAIL: a member could write availability rows directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.set_my_availability(jsonb_build_array(jsonb_build_object('start', current_date - 3, 'end', current_date + 2)));
    RAISE EXCEPTION 'FAIL: past dates were accepted';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  -- Two touching ranges are stored as one.
  v_json := public.set_my_availability(jsonb_build_array(
    jsonb_build_object('start', current_date + 100, 'end', current_date + 104),
    jsonb_build_object('start', current_date + 105, 'end', current_date + 110)
  ));
  IF jsonb_array_length(v_json) <> 1 OR (v_json->0->>'end')::date <> current_date + 110 THEN
    RAISE EXCEPTION 'FAIL: touching ranges were not merged: %', v_json;
  END IF;
  RESET ROLE;

  -- Crossing a booked sit is refused (only if this Nomad has one).
  IF EXISTS (SELECT 1 FROM public.sits s JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
             WHERE s.sitter_user_id = v_sitter AND s.status IN ('confirmed', 'in_progress') AND sd.end_date >= current_date) THEN
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM public.set_my_availability((
        SELECT jsonb_build_array(jsonb_build_object('start', GREATEST(sd.start_date, current_date), 'end', sd.end_date))
        FROM public.sits s JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
        WHERE s.sitter_user_id = v_sitter AND s.status IN ('confirmed', 'in_progress') AND sd.end_date >= current_date
        LIMIT 1));
      RAISE EXCEPTION 'FAIL: availability crossing a booked sit was accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'That range crosses a booked sit%' THEN
        RAISE EXCEPTION 'FAIL: unexpected error for a booked sit: %', SQLERRM;
      END IF;
    END;
    RESET ROLE;
  END IF;

  -- Another member: no direct rows, only free ranges through the function.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.sitter_availability WHERE sitter_user_id = v_sitter;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: another member could read a Nomad''s availability rows';
  END IF;
  v_json := public.get_sitter_free_dates(v_sitter);
  IF jsonb_array_length(v_json) < 1
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_json) e, jsonb_object_keys(e) k WHERE k NOT IN ('start', 'end', 'days')) THEN
    RAISE EXCEPTION 'FAIL: get_sitter_free_dates returned the wrong data: %', v_json;
  END IF;
  RESET ROLE;
END;
$$;

SELECT 'PASS: every check behaved as expected (rolled back)' AS result;

ROLLBACK;
