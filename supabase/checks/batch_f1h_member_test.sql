-- Batch F1h: behaviour test. City Chat rooms never hold a home's location.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Test data: a home "F1h sample listing" in "F1hville", Testland (a city with
-- no room yet), at a made-up spot in the South Atlantic; a sit confirmed on it.
-- Needs two non-admin members, the first with no listing.
--
-- The approximate point is random (within 500 m of the home), so after
-- rounding it may land within 1 km of the home; the room then has no
-- coordinates. The test accepts either outcome for the new room, and then
-- checks both rules directly: a point on the home is cleared, a point 5 km
-- away is kept (rounded), and moving a home next to a room clears it.

DO $$
DECLARE
  v_owner uuid;
  v_nomad uuid;
  v_listing uuid;
  v_dates uuid;
  v_room uuid;
  v_lat numeric;
  v_lng numeric;
  c_home_lat constant numeric := -40.123456;
  c_home_lng constant numeric := -20.654321;
  v_m double precision;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT p.id INTO v_owner FROM public.profiles p WHERE p.is_admin IS NOT TRUE
    AND NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p.id) ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO v_nomad FROM public.profiles p WHERE p.is_admin IS NOT TRUE AND p.id <> v_owner ORDER BY p.created_at LIMIT 1;
  IF v_owner IS NULL OR v_nomad IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs two non-admin members, the first with no listing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.city_chat_rooms WHERE city_key = public.city_chat_key('F1hville', 'Testland')) THEN
    RAISE EXCEPTION 'FAIL: a F1hville room already exists (run batch_f1h_leftover.sql)';
  END IF;

  -- Test data (as the server): the home, its dates, a confirmed sit.
  UPDATE public.profiles SET membership_status = 'active', membership_type = 'owner', membership_expiry = now() + interval '1 year',
         membership_payment_failed_at = NULL WHERE id = v_owner;
  INSERT INTO public.listings (owner_user_id, title, status, city, country, latitude, longitude, owner_declaration_accepted_at)
  VALUES (v_owner, 'F1h sample listing', 'published', 'F1hville', 'Testland', c_home_lat, c_home_lng, now())
  RETURNING id INTO v_listing;
  IF NOT EXISTS (SELECT 1 FROM public.listings WHERE id = v_listing AND approx_latitude IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL: the test home got no approximate location';
  END IF;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status)
  VALUES (v_listing, current_date + 30, current_date + 35, 'booked') RETURNING id INTO v_dates;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, v_dates, v_owner, v_nomad, 'confirmed', now());

  -- ── The new room: rounded and more than 1 km from the home, or empty ──
  SELECT id, latitude, longitude INTO v_room, v_lat, v_lng FROM public.city_chat_rooms
  WHERE city_key = public.city_chat_key('F1hville', 'Testland');
  IF v_room IS NULL THEN RAISE EXCEPTION 'FAIL: confirming the sit did not create its room'; END IF;
  IF (v_lat IS NULL) <> (v_lng IS NULL) THEN RAISE EXCEPTION 'FAIL: the room has half a location'; END IF;
  IF v_lat IS NOT NULL THEN
    IF v_lat <> round(v_lat, 2) OR v_lng <> round(v_lng, 2) THEN
      RAISE EXCEPTION 'FAIL: the room location is not rounded to 2 decimals';
    END IF;
    IF v_lat = c_home_lat AND v_lng = c_home_lng THEN RAISE EXCEPTION 'FAIL: the room holds the exact home location'; END IF;
    v_m := public.nn_distance_m(v_lat, v_lng, c_home_lat, c_home_lng);
    IF v_m < 1000 THEN RAISE EXCEPTION 'FAIL: the room is % m from the home', round(v_m::numeric); END IF;
  END IF;

  -- ── A point on the home is cleared ────────────────────────────────────
  UPDATE public.city_chat_rooms SET latitude = c_home_lat, longitude = c_home_lng WHERE id = v_room;
  IF EXISTS (SELECT 1 FROM public.city_chat_rooms WHERE id = v_room AND latitude IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL: a room could be given the exact home location';
  END IF;

  -- ── A point 5 km away is kept, rounded ────────────────────────────────
  UPDATE public.city_chat_rooms SET latitude = c_home_lat + 0.045123, longitude = c_home_lng WHERE id = v_room;
  SELECT latitude, longitude INTO v_lat, v_lng FROM public.city_chat_rooms WHERE id = v_room;
  IF v_lat IS DISTINCT FROM round(c_home_lat + 0.045123, 2) OR v_lng IS DISTINCT FROM round(c_home_lng, 2) THEN
    RAISE EXCEPTION 'FAIL: a point 5 km from any home was not kept rounded (got %, %)', v_lat, v_lng;
  END IF;

  -- ── Moving a home next to that point clears it ────────────────────────
  UPDATE public.listings SET latitude = v_lat + 0.001, longitude = v_lng WHERE id = v_listing;
  IF EXISTS (SELECT 1 FROM public.city_chat_rooms WHERE id = v_room AND latitude IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL: moving a home within 1 km of a room did not clear the room location';
  END IF;

  -- ── Members still read rooms (names only) ─────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (SELECT 1 FROM public.city_chat_rooms WHERE id = v_room AND city = 'F1hville') THEN
    RESET ROLE; RAISE EXCEPTION 'FAIL: a member can no longer read the room';
  END IF;
  RESET ROLE;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;
