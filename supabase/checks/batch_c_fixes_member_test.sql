-- Batch C fixes: behaviour test, acting as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Needs: a non-admin member with a Nomad profile and a non-admin member with no
-- listing (the test gives them a temporary one).
-- Test data: the title "Fixes test listing 2099", dates in 2099 and the message
-- "Fixes test 2099", so the leftover check can prove nothing stayed.
-- Server-side updates of profiles clear the request claims first, or
-- prevent_privilege_escalation (correctly) refuses them.

DO $$
DECLARE
  v_owner uuid;
  v_nomad uuid;
  v_listing uuid;
  v_range uuid;
  v_done_range uuid;
  v_app uuid;
  v_done_app uuid;
  v_seen boolean;
  v_sit_status text;
  v_status text;
  v_copy boolean;
  v_real boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT sp.user_id INTO v_nomad
  FROM public.sitter_profiles sp JOIN public.profiles p ON p.id = sp.user_id
  WHERE p.is_admin IS NOT TRUE
  ORDER BY p.created_at LIMIT 1;

  SELECT p.id INTO v_owner FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id <> v_nomad
    AND NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p.id)
  ORDER BY p.created_at LIMIT 1;

  IF v_nomad IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a non-admin Nomad and a non-admin member with no listing';
  END IF;

  -- ── Test data (as the server) ──────────────────────────────────────────
  INSERT INTO public.listings (owner_user_id, title, status, city, country, owner_declaration_accepted_at)
  VALUES (v_owner, 'Fixes test listing 2099', 'published', 'Testville', 'Testland', now())
  RETURNING id INTO v_listing;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, '2099-03-01', '2099-03-10') RETURNING id INTO v_range;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, '2099-01-01', '2099-01-05') RETURNING id INTO v_done_range;
  INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, status, message)
  VALUES (v_listing, v_range, v_nomad, 'applied', 'Fixes test 2099') RETURNING id INTO v_app;
  -- An accepted application whose sit has finished.
  INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, status, message)
  VALUES (v_listing, v_done_range, v_nomad, 'applied', 'Fixes test 2099') RETURNING id INTO v_done_app;
  UPDATE public.applications SET status = 'accepted' WHERE id = v_done_app;
  INSERT INTO public.sits (listing_id, sit_dates_id, sitter_user_id, owner_user_id, status, confirmed_at, completed_at)
  VALUES (v_listing, v_done_range, v_nomad, v_owner, 'completed', now(), now());

  -- ── 1. The owner sees their applicants and owner_seen ──────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.mark_applications_seen(ARRAY[v_app]);
  SELECT a.owner_seen INTO v_seen FROM public.get_listing_applicants(v_listing) a WHERE a.application_id = v_app;
  IF v_seen IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: the owner could not see owner_seen on their applicant (got %)', v_seen;
  END IF;

  -- ── 2. A finished sit comes back as completed ──────────────────────────
  SELECT a.sit_status INTO v_sit_status FROM public.get_listing_applicants(v_listing) a WHERE a.application_id = v_done_app;
  IF v_sit_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'FAIL: the finished sit came back as % instead of completed', COALESCE(v_sit_status, 'nothing');
  END IF;
  RESET ROLE;

  -- ── 3. The Nomad can't read owner_seen_at, but can read the rest ───────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM a.owner_seen_at FROM public.applications a WHERE a.id = v_app;
    RAISE EXCEPTION 'FAIL: a Nomad could read owner_seen_at on their own application';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.applications a WHERE a.id = v_app;
    RAISE EXCEPTION 'FAIL: a Nomad could select every column of applications';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT a.status::text INTO v_status FROM public.applications a WHERE a.id = v_app;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'FAIL: the Nomad could not read their own application any more';
  END IF;
  RESET ROLE;

  -- ── 4. sitter_profiles.id_verified follows profiles.id_verified ────────
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT COALESCE(p.id_verified, false) INTO v_real FROM public.profiles p WHERE p.id = v_nomad;
  UPDATE public.profiles SET id_verified = NOT v_real WHERE id = v_nomad;
  SELECT sp.id_verified INTO v_copy FROM public.sitter_profiles sp WHERE sp.user_id = v_nomad;
  IF v_copy IS DISTINCT FROM (NOT v_real) THEN
    RAISE EXCEPTION 'FAIL: sitter_profiles.id_verified did not follow profiles.id_verified';
  END IF;
  -- And back again, so the copy follows both ways.
  UPDATE public.profiles SET id_verified = v_real WHERE id = v_nomad;
  SELECT sp.id_verified INTO v_copy FROM public.sitter_profiles sp WHERE sp.user_id = v_nomad;
  IF v_copy IS DISTINCT FROM v_real THEN
    RAISE EXCEPTION 'FAIL: sitter_profiles.id_verified did not follow back';
  END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;

-- Leftover check (run after the test): every count must be 0.
-- SELECT
--   (SELECT count(*) FROM public.listings WHERE title = 'Fixes test listing 2099') AS test_listings,
--   (SELECT count(*) FROM public.sit_dates WHERE start_date >= '2099-01-01') AS test_dates,
--   (SELECT count(*) FROM public.applications WHERE message = 'Fixes test 2099') AS test_applications,
--   (SELECT count(*) FROM public.sits s JOIN public.sit_dates d ON d.id = s.sit_dates_id WHERE d.start_date >= '2099-01-01') AS test_sits;
