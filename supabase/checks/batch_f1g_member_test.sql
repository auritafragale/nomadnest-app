-- Batch F1g: behaviour test, acting as a visitor and as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Test data: a perk "f1g-test-perk" with code "F1GTEST2099", and a listing
-- "F1g sample listing" in "F1gville". Needs four non-admin members (their
-- memberships are set inside the test: paying, Founding, past due within
-- the grace week, and none).

DO $$
DECLARE
  v_paying uuid;
  v_founding uuid;
  v_pastdue uuid;
  v_none uuid;
  v_listing uuid;
  v_dates uuid;
  v_code text;
  v_raised boolean;
  v_col text;
  v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT id INTO v_paying FROM public.profiles WHERE is_admin IS NOT TRUE ORDER BY created_at LIMIT 1;
  SELECT id INTO v_founding FROM public.profiles WHERE is_admin IS NOT TRUE AND id <> v_paying ORDER BY created_at LIMIT 1;
  SELECT id INTO v_pastdue FROM public.profiles WHERE is_admin IS NOT TRUE AND id NOT IN (v_paying, v_founding) ORDER BY created_at LIMIT 1;
  SELECT id INTO v_none FROM public.profiles WHERE is_admin IS NOT TRUE AND id NOT IN (v_paying, v_founding, v_pastdue)
    AND NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = profiles.id)
  ORDER BY created_at LIMIT 1;
  IF v_paying IS NULL OR v_founding IS NULL OR v_pastdue IS NULL OR v_none IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs four non-admin members (one with no listing)';
  END IF;

  -- Test data (as the server).
  UPDATE public.profiles SET founding_member = false, membership_status = 'active', membership_type = 'sitter',
         membership_expiry = now() + interval '1 year', membership_payment_failed_at = NULL WHERE id = v_paying;
  UPDATE public.profiles SET founding_member = true, membership_status = 'none', membership_type = NULL,
         membership_expiry = NULL, membership_payment_failed_at = NULL WHERE id = v_founding;
  UPDATE public.profiles SET founding_member = false, membership_status = 'past_due', membership_type = 'owner',
         membership_expiry = now() + interval '1 year', membership_payment_failed_at = now() - interval '2 days' WHERE id = v_pastdue;
  UPDATE public.profiles SET founding_member = false, membership_status = 'none', membership_type = NULL,
         membership_expiry = NULL, membership_payment_failed_at = NULL WHERE id = v_none;
  INSERT INTO public.perks (name, slug, category, benefit_short, affiliate_url, discount_code, subid_param, is_active)
  VALUES ('F1g test perk', 'f1g-test-perk', 'other', 'F1g test benefit', 'https://example.com/f1g', 'F1GTEST2099', 'subid', true);

  -- ── A visitor sees the perk, never its code or link ──────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_n FROM public.perks WHERE slug = 'f1g-test-perk';
  IF v_n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a visitor can no longer see an active perk'; END IF;
  FOREACH v_col IN ARRAY ARRAY['discount_code', 'affiliate_url', 'subid_param'] LOOP
    v_raised := false;
    BEGIN
      EXECUTE format('SELECT %I FROM public.perks WHERE slug = %L', v_col, 'f1g-test-perk');
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a visitor could read perks.%', v_col; END IF;
  END LOOP;
  v_raised := false;
  BEGIN
    PERFORM public.get_perk_discount_code('f1g-test-perk');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a visitor could call get_perk_discount_code'; END IF;
  RESET ROLE;

  -- ── A member without membership: no columns, "Membership required" ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_none, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_col IN ARRAY ARRAY['discount_code', 'affiliate_url', 'subid_param'] LOOP
    v_raised := false;
    BEGIN
      EXECUTE format('SELECT %I FROM public.perks WHERE slug = %L', v_col, 'f1g-test-perk');
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a member could read perks.%', v_col; END IF;
  END LOOP;
  v_raised := false;
  BEGIN
    v_code := public.get_perk_discount_code('f1g-test-perk');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Membership required' THEN RESET ROLE; RAISE EXCEPTION 'FAIL: unexpected error for a non-member: %', SQLERRM; END IF;
    v_raised := true;
  END;
  IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a member without membership got the code'; END IF;
  -- … and can't create a City Chat room.
  v_raised := false;
  BEGIN
    INSERT INTO public.city_chat_rooms (city, country, city_key) VALUES ('F1gville', 'Testland', public.city_chat_key('F1gville', 'Testland'));
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a member could create a City Chat room'; END IF;
  RESET ROLE;

  -- ── Paying, Founding and past-due-in-grace members get the code ──────
  FOREACH v_col IN ARRAY ARRAY[v_paying::text, v_founding::text, v_pastdue::text] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_col, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      v_code := public.get_perk_discount_code('f1g-test-perk');
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      RAISE EXCEPTION 'FAIL: a member with access was refused the code: %', SQLERRM;
    END;
    RESET ROLE;
    IF v_code IS DISTINCT FROM 'F1GTEST2099' THEN
      RAISE EXCEPTION 'FAIL: a member with access got % instead of the code', COALESCE(v_code, 'nothing');
    END IF;
  END LOOP;

  -- ── Confirming a sit still creates its City Chat room ────────────────
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.listings (owner_user_id, title, status, city, country, owner_declaration_accepted_at)
  VALUES (v_none, 'F1g sample listing', 'published', 'F1gville', 'Testland', now()) RETURNING id INTO v_listing;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status)
  VALUES (v_listing, current_date + 40, current_date + 45, 'booked') RETURNING id INTO v_dates;
  INSERT INTO public.sits (listing_id, sit_dates_id, owner_user_id, sitter_user_id, status, confirmed_at)
  VALUES (v_listing, v_dates, v_none, v_paying, 'confirmed', now());
  IF NOT EXISTS (SELECT 1 FROM public.city_chat_rooms WHERE city_key = public.city_chat_key('F1gville', 'Testland')) THEN
    RAISE EXCEPTION 'FAIL: confirming a sit did not create its City Chat room';
  END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;
