-- Profiles privacy: behaviour test as a signed-out visitor and as members.
-- Runs inside a transaction and ROLLS BACK: nothing is changed.
--
-- Needs two non-admin members. Result: the last query returns "PASS";
-- anything unexpected stops with an error starting "FAIL:".

BEGIN;

DO $$
DECLARE
  v_a uuid;
  v_b uuid;
  v_json jsonb;
  v_stmt text;
  v_denied text[];
  v_hidden uuid;
  v_viewer uuid;
  v_seen integer;
  v_lat double precision;
BEGIN
  SELECT id INTO v_a FROM public.profiles WHERE is_admin IS NOT TRUE ORDER BY created_at LIMIT 1;
  SELECT id INTO v_b FROM public.profiles WHERE is_admin IS NOT TRUE AND id <> v_a ORDER BY created_at LIMIT 1;
  IF v_a IS NULL OR v_b IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs two non-admin members';
  END IF;

  -- ── Signed-out visitor ───────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  FOREACH v_stmt IN ARRAY ARRAY[
    'SELECT first_name FROM public.profiles LIMIT 1',
    'SELECT id FROM public.profiles LIMIT 1',
    'SELECT first_name FROM public.public_profiles LIMIT 1',
    'SELECT user_id FROM public.sitter_profiles LIMIT 1',
    'SELECT latitude FROM public.sitter_profiles LIMIT 1',
    'SELECT user_id FROM public.owner_profiles LIMIT 1'
  ] LOOP
    BEGIN
      EXECUTE v_stmt;
      RAISE EXCEPTION 'FAIL: a signed-out visitor could run: %', v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  -- The signed-out card function returns first name and photo only.
  v_json := public.get_public_member_cards(ARRAY[v_a, v_b]);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_json) e, jsonb_object_keys(e) k
    WHERE k NOT IN ('id', 'first_name', 'avatar_url')
  ) THEN
    RAISE EXCEPTION 'FAIL: get_public_member_cards returns more than first name and photo';
  END IF;
  BEGIN
    PERFORM public.get_my_profile();
    RAISE EXCEPTION 'FAIL: a signed-out visitor could call get_my_profile';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- ── Member A ─────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Another member's (and their own) last name, full name and location: refused.
  v_denied := ARRAY[
    format('SELECT last_name FROM public.profiles WHERE id = %L', v_b),
    format('SELECT full_name FROM public.profiles WHERE id = %L', v_b),
    format('SELECT location FROM public.profiles WHERE id = %L', v_b),
    format('SELECT last_name FROM public.profiles WHERE id = %L', v_a),
    format('SELECT email FROM public.profiles WHERE id = %L', v_b),
    'SELECT * FROM public.profiles LIMIT 1',
    -- The profile update must not reach these.
    format('UPDATE public.profiles SET is_admin = true WHERE id = %L', v_a),
    format('UPDATE public.profiles SET reliability_score = 100 WHERE id = %L', v_a),
    format('UPDATE public.profiles SET membership_status = %L WHERE id = %L', 'active', v_a),
    format('UPDATE public.profiles SET membership_type = %L WHERE id = %L', 'combined', v_a),
    format('UPDATE public.profiles SET membership_expiry = now() WHERE id = %L', v_a)
  ];
  FOREACH v_stmt IN ARRAY v_denied LOOP
    BEGIN
      EXECUTE v_stmt;
      RAISE EXCEPTION 'FAIL: a member could run: %', v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  -- The display fields still work.
  EXECUTE format('SELECT first_name, avatar_url, city, country, bio FROM public.profiles WHERE id = %L', v_b);
  PERFORM 1 FROM public.public_profiles LIMIT 1;

  -- get_my_profile: only the caller's own row, with the private fields.
  v_json := public.get_my_profile();
  IF v_json IS NULL OR (v_json->>'id')::uuid <> v_a THEN
    RAISE EXCEPTION 'FAIL: get_my_profile did not return the caller''s own row';
  END IF;
  IF NOT (v_json ? 'last_name') OR (v_json ? 'is_admin') THEN
    RAISE EXCEPTION 'FAIL: get_my_profile returns the wrong fields';
  END IF;

  -- A member can still edit their own profile.
  EXECUTE format('UPDATE public.profiles SET bio = bio, city = city, first_name = first_name, last_name = %L WHERE id = %L', 'Test', v_a);
  RESET ROLE;

  -- ── A hidden Nomad is invisible to unrelated members ────────────────────
  SELECT sp.user_id INTO v_hidden FROM public.sitter_profiles sp ORDER BY sp.created_at LIMIT 1;
  IF v_hidden IS NULL THEN
    RAISE EXCEPTION 'FAIL: no Nomad profile to test with';
  END IF;
  -- A viewer with no application, invite or sit with that Nomad.
  SELECT p.id INTO v_viewer FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id <> v_hidden
    AND NOT EXISTS (SELECT 1 FROM public.applications a JOIN public.listings l ON l.id = a.listing_id
                    WHERE a.sitter_user_id = v_hidden AND l.owner_user_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.sitter_invites i WHERE i.sitter_user_id = v_hidden AND i.owner_user_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.sits s WHERE s.sitter_user_id = v_hidden AND s.owner_user_id = p.id)
  ORDER BY p.created_at LIMIT 1;
  IF v_viewer IS NULL THEN
    RAISE EXCEPTION 'FAIL: no unrelated member to test with';
  END IF;

  UPDATE public.sitter_profiles SET is_visible = false, is_active = true WHERE user_id = v_hidden;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_seen FROM public.sitter_profiles WHERE user_id = v_hidden;
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'FAIL: a member could see a hidden Nomad''s profile';
  END IF;
  RESET ROLE;
  -- ...but the Nomad still sees their own.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_hidden, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_seen FROM public.sitter_profiles WHERE user_id = v_hidden;
  IF v_seen <> 1 THEN
    RAISE EXCEPTION 'FAIL: a hidden Nomad can''t see their own profile';
  END IF;

  -- ── A precise coordinate is stored rounded (about 1 km) ──────────────────
  UPDATE public.sitter_profiles SET latitude = 25.123456, longitude = 55.987654 WHERE user_id = v_hidden;
  RESET ROLE;
  SELECT latitude INTO v_lat FROM public.sitter_profiles WHERE user_id = v_hidden;
  IF v_lat::numeric <> 25.12 THEN
    RAISE EXCEPTION 'FAIL: a precise latitude was stored as % (expected 25.12)', v_lat;
  END IF;
END;
$$;

SELECT 'PASS: every check behaved as expected (rolled back)' AS result;

ROLLBACK;
