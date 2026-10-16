-- Batch P2: behaviour test, acting as members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Test data: a perk "p2-test-perk" with short title "{country} test plan",
-- and storage rows named "p2-test-*" (no file is stored). Needs two non-admin
-- members (a paying one and one without membership); an admin is used if
-- there is one.

DO $$
DECLARE
  v_member uuid;
  v_none uuid;
  v_admin uuid;
  v_perk uuid;
  v_n integer;
  v_raised boolean;
  v_stmt text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT id INTO v_member FROM public.profiles WHERE is_admin IS NOT TRUE ORDER BY created_at LIMIT 1;
  SELECT id INTO v_none FROM public.profiles WHERE is_admin IS NOT TRUE AND id <> v_member ORDER BY created_at LIMIT 1;
  SELECT id INTO v_admin FROM public.profiles WHERE is_admin IS TRUE ORDER BY created_at LIMIT 1;
  IF v_member IS NULL OR v_none IS NULL THEN RAISE EXCEPTION 'FAIL: needs two non-admin members'; END IF;

  UPDATE public.profiles SET founding_member = false, membership_status = 'active', membership_type = 'sitter',
         membership_expiry = now() + interval '1 year', membership_payment_failed_at = NULL WHERE id = v_member;
  UPDATE public.profiles SET founding_member = false, membership_status = 'none', membership_type = NULL,
         membership_expiry = NULL, membership_payment_failed_at = NULL WHERE id = v_none;
  INSERT INTO public.perks (name, slug, category, benefit_short, affiliate_url, is_active, trip_moment, short_title)
  VALUES ('P2 test perk', 'p2-test-perk', 'Other', 'P2 test', 'https://example.com/p2', true, 'before', '{country} test plan')
  RETURNING id INTO v_perk;

  -- ── A member's click is stored with its placement (as perk-redirect does) ─
  INSERT INTO public.perk_clicks (perk_id, user_id, placement) VALUES (v_perk, v_member, 'sit_upcoming');
  IF NOT EXISTS (SELECT 1 FROM public.perk_clicks WHERE perk_id = v_perk AND user_id = v_member AND placement = 'sit_upcoming' AND referrer IS NULL) THEN
    RAISE EXCEPTION 'FAIL: the click was not stored with its placement';
  END IF;
  INSERT INTO public.perk_clicks (perk_id, user_id) VALUES (v_perk, v_member);
  IF NOT EXISTS (SELECT 1 FROM public.perk_clicks WHERE perk_id = v_perk AND placement = 'perks_page') THEN
    RAISE EXCEPTION 'FAIL: a click without a placement is not "perks_page"';
  END IF;
  v_raised := false;
  BEGIN
    INSERT INTO public.perk_clicks (perk_id, user_id, placement) VALUES (v_perk, v_member, '/sits/someone-else');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL: a placement that is not one of the six was stored'; END IF;

  -- The member sees it in their list, with the short title and "used".
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.get_member_perks() x
  WHERE x.slug = 'p2-test-perk' AND x.short_title = '{country} test plan' AND x.used_by_me;
  IF v_n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'FAIL: the member list lacks the short title or "used"'; END IF;
  -- … but can't write clicks or read them directly.
  FOREACH v_stmt IN ARRAY ARRAY[
    format('INSERT INTO public.perk_clicks (perk_id, user_id, placement) VALUES (%L, %L, %L)', v_perk, v_member, 'menu'),
    'SELECT name FROM public.perks LIMIT 1'
  ] LOOP
    v_raised := false;
    BEGIN
      EXECUTE v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a member could run: %', v_stmt; END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM public.perk_clicks WHERE perk_id = v_perk;
  IF v_n <> 0 THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a member could read clicks'; END IF;

  -- ── A member can't upload, replace or delete perk logos ──────────────
  v_raised := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('perk-logos', 'p2-test-member.png', v_member::text);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a member could upload a perk logo'; END IF;
  RESET ROLE;

  -- ── A non-member gets nothing from the member list ────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_none, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_raised := false;
  BEGIN
    PERFORM 1 FROM public.get_member_perks();
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: a non-member got the member list'; END IF;
  RESET ROLE;

  -- ── An admin can upload an image, but not another file type ──────────
  IF v_admin IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('perk-logos', 'p2-test-admin.png', v_admin::text);
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE; RAISE EXCEPTION 'FAIL: an admin could not upload a PNG logo (% %)', SQLSTATE, SQLERRM;
    END;
    v_raised := false;
    BEGIN
      INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('perk-logos', 'p2-test-admin.html', v_admin::text);
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: an admin could upload an .html file as a logo'; END IF;
    RESET ROLE;
  END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;
