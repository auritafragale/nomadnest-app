-- Batch P1: behaviour test, acting as a visitor and as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Test data: a perk "p1-test-perk" (code "P1TEST2099") and a listing
-- "P1 sample listing" in "P1ville". Needs three non-admin members (their
-- memberships are set inside the test: paying, Founding, none); the paying
-- one must have no listing.

DO $$
DECLARE
  v_paying uuid;
  v_founding uuid;
  v_none uuid;
  v_listing uuid;
  v_dates uuid;
  v_who uuid;
  v_code text;
  v_raised boolean;
  v_n integer;
  v_keys text[];
  v_stmt text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT id INTO v_paying FROM public.profiles p WHERE is_admin IS NOT TRUE
    AND NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p.id) ORDER BY created_at LIMIT 1;
  SELECT id INTO v_founding FROM public.profiles WHERE is_admin IS NOT TRUE AND id <> v_paying ORDER BY created_at LIMIT 1;
  SELECT id INTO v_none FROM public.profiles WHERE is_admin IS NOT TRUE AND id NOT IN (v_paying, v_founding) ORDER BY created_at LIMIT 1;
  IF v_paying IS NULL OR v_founding IS NULL OR v_none IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs three non-admin members (one with no listing)';
  END IF;

  -- Test data (as the server).
  UPDATE public.profiles SET founding_member = false, membership_status = 'active', membership_type = 'owner',
         membership_expiry = now() + interval '1 year', membership_payment_failed_at = NULL WHERE id = v_paying;
  UPDATE public.profiles SET founding_member = true WHERE id = v_founding;
  UPDATE public.profiles SET founding_member = false, membership_status = 'none', membership_type = NULL,
         membership_expiry = NULL, membership_payment_failed_at = NULL WHERE id = v_none;
  INSERT INTO public.perks (name, slug, category, benefit_short, affiliate_url, discount_code, subid_param, is_active,
                            trip_moment, benefit_headline, benefit_subline, picked_for_sits)
  VALUES ('P1 test perk', 'p1-test-perk', 'Other', 'P1 test benefit', 'https://example.com/p1', 'P1TEST2099', 'subid', true,
          'before', '$5 off', 'P1 test subline', true);
  -- The paying member's own confirmed sit, as a Pet Parent with a Nomad.
  INSERT INTO public.listings (owner_user_id, title, status, city, country, owner_declaration_accepted_at)
  VALUES (v_paying, 'P1 sample listing', 'published', 'P1ville', 'Testland', now()) RETURNING id INTO v_listing;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status)
  VALUES (v_listing, current_date + 30, current_date + 35, 'booked') RETURNING id INTO v_dates;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, v_dates, v_paying, v_founding, 'confirmed', now());

  -- ── A visitor: the preview only ───────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  SELECT array_agg(k ORDER BY k) INTO v_keys
  FROM (SELECT DISTINCT jsonb_object_keys(to_jsonb(x)) AS k FROM public.get_perks_preview() x) t;
  IF v_keys IS DISTINCT FROM ARRAY['category', 'id', 'logo_url', 'name', 'sort_order', 'trip_moment'] THEN
    RESET ROLE; RAISE EXCEPTION 'FAIL: the preview returned %', v_keys;
  END IF;
  SELECT count(*) INTO v_n FROM public.get_perks_preview() WHERE name = 'P1 test perk';
  IF v_n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'FAIL: the preview did not list an active perk'; END IF;
  FOREACH v_stmt IN ARRAY ARRAY[
    'SELECT 1 FROM public.get_member_perks()',
    'SELECT public.get_perk_discount_code(''p1-test-perk'')',
    'SELECT 1 FROM public.get_my_next_sit_for_perks()',
    'SELECT name FROM public.perks LIMIT 1',
    'SELECT discount_code FROM public.perks LIMIT 1'
  ] LOOP
    v_raised := false;
    BEGIN
      EXECUTE v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a visitor could run: %', v_stmt; END IF;
  END LOOP;
  RESET ROLE;

  -- ── A signed-in non-member: the same as a visitor ─────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_none, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.get_perks_preview() WHERE name = 'P1 test perk';
  IF v_n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a non-member did not get the preview'; END IF;
  FOREACH v_stmt IN ARRAY ARRAY[
    'SELECT 1 FROM public.get_member_perks()',
    'SELECT name FROM public.perks LIMIT 1',
    'SELECT discount_code FROM public.perks LIMIT 1',
    'SELECT affiliate_url FROM public.perks LIMIT 1',
    'SELECT subid_param FROM public.perks LIMIT 1'
  ] LOOP
    v_raised := false;
    BEGIN
      EXECUTE v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a non-member could run: %', v_stmt; END IF;
  END LOOP;
  v_raised := false;
  BEGIN
    v_code := public.get_perk_discount_code('p1-test-perk');
  EXCEPTION WHEN raise_exception THEN v_raised := (SQLERRM = 'Membership required');
  END;
  IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a non-member got the code (or an unexpected error)'; END IF;
  SELECT count(*) INTO v_n FROM public.get_my_next_sit_for_perks();
  IF v_n <> 0 THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a non-member got a next sit'; END IF;
  RESET ROLE;

  -- ── Paying and Founding members: the full list and codes ──────────────
  FOREACH v_who IN ARRAY ARRAY[v_paying, v_founding] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT array_agg(DISTINCT k ORDER BY k) INTO v_keys
    FROM (SELECT jsonb_object_keys(to_jsonb(x)) AS k FROM public.get_member_perks() x) t;
    IF v_keys && ARRAY['discount_code', 'affiliate_url', 'subid_param'] THEN
      RESET ROLE; RAISE EXCEPTION 'FAIL: the member list returned a code, link or subid column: %', v_keys;
    END IF;
    SELECT count(*) INTO v_n FROM public.get_member_perks() x
    WHERE x.slug = 'p1-test-perk' AND x.has_code AND x.benefit_headline = '$5 off' AND x.trip_moment = 'before';
    IF v_n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a member did not get the full perk'; END IF;
    v_code := public.get_perk_discount_code('p1-test-perk');
    IF v_code IS DISTINCT FROM 'P1TEST2099' THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a member did not get the code'; END IF;
    RESET ROLE;
  END LOOP;

  -- ── Next sit: your own, never someone else's ──────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_paying, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.get_my_next_sit_for_perks() WHERE city = 'P1ville';
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the Pet Parent did not get their own next sit'; END IF;
  -- The Founding member is the Nomad on that sit, so it is theirs too; the
  -- non-member and any other member must not see it.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT id INTO v_who FROM public.profiles WHERE is_admin IS NOT TRUE AND id NOT IN (v_paying, v_founding, v_none) ORDER BY created_at LIMIT 1;
  IF v_who IS NOT NULL THEN
    UPDATE public.profiles SET founding_member = true WHERE id = v_who;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_who, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.get_my_next_sit_for_perks() WHERE city = 'P1ville';
    RESET ROLE;
    IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a member could read another member''s next sit'; END IF;
  END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;
