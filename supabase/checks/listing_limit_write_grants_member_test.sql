-- Listing limit + column-level write grants: behaviour test AS A MEMBER.
-- Runs inside a transaction and ROLLS BACK: nothing is changed.
--
-- It picks a non-admin member who owns at least one listing (to test the
-- listing limit too). To test a specific member, replace the SELECT in
-- step 1 with their user id.
--
-- Result: if every check behaves as expected, the last query returns
-- "PASS". Any unexpected result stops with an error starting "FAIL:".

BEGIN;

-- 1. Act as the member (their JWT), then drop to the authenticated role.
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', p.id, 'role', 'authenticated')::text,
  true
)
FROM public.profiles p
WHERE p.is_admin IS NOT TRUE
  AND EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p.id)
ORDER BY p.created_at
LIMIT 1;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_uid uuid := auth.uid();
  v_stmt text;
  v_settings jsonb;
  -- Each of these must fail with "permission denied" (42501).
  v_denied text[] := ARRAY[
    'UPDATE public.profiles SET reliability_score = 100 WHERE id = auth.uid()',
    'UPDATE public.profiles SET flagged_for_admin_review = false WHERE id = auth.uid()',
    'UPDATE public.profiles SET max_listings = 5 WHERE id = auth.uid()',
    'UPDATE public.profiles SET founding_badge = true WHERE id = auth.uid()',
    'UPDATE public.profiles SET is_admin = true WHERE id = auth.uid()',
    'UPDATE public.profiles SET membership_status = ''active'' WHERE id = auth.uid()',
    'UPDATE public.profiles SET id_verified = true WHERE id = auth.uid()',
    'UPDATE public.profiles SET phone_verified_at = now() WHERE id = auth.uid()',
    'UPDATE public.profiles SET phone_line_type = ''mobile'' WHERE id = auth.uid()',
    'UPDATE public.profiles SET onfido_applicant_id = ''x'' WHERE id = auth.uid()',
    'UPDATE public.profiles SET email = ''x@example.com'' WHERE id = auth.uid()',
    'INSERT INTO public.profiles (id) VALUES (gen_random_uuid())',
    'UPDATE public.sitter_profiles SET background_check = true WHERE user_id = auth.uid()',
    'UPDATE public.sitter_profiles SET id_verified = true WHERE user_id = auth.uid()',
    'INSERT INTO public.sitter_profiles (user_id, id_verified) VALUES (auth.uid(), true)',
    'UPDATE public.listings SET owner_user_id = auth.uid() WHERE owner_user_id = auth.uid()',
    'UPDATE public.listings SET approx_latitude = 0 WHERE owner_user_id = auth.uid()',
    'UPDATE public.sits SET owner_user_id = auth.uid() WHERE owner_user_id = auth.uid()',
    'UPDATE public.welcome_guide_photos SET storage_path = ''x'' WHERE owner_user_id = auth.uid()',
    'UPDATE public.notifications SET title = ''x'' WHERE user_id = auth.uid()',
    'SELECT max_listings FROM public.profiles WHERE id = auth.uid()',
    'SELECT owner_declaration_accepted_at FROM public.listings WHERE owner_user_id = auth.uid()',
    'SELECT flag_not_homeowner FROM public.reviews LIMIT 1'
  ];
  -- Each of these must still work (no-op edits of the member's own rows).
  v_allowed text[] := ARRAY[
    'UPDATE public.profiles SET bio = bio, city = city, avatar_url = avatar_url WHERE id = auth.uid()',
    'UPDATE public.sitter_profiles SET is_visible = is_visible, headline = headline WHERE user_id = auth.uid()',
    'UPDATE public.owner_profiles SET bio = bio, is_active = is_active WHERE user_id = auth.uid()',
    'UPDATE public.listings SET title = title, status = status WHERE owner_user_id = auth.uid()',
    'UPDATE public.notifications SET read_at = read_at WHERE user_id = auth.uid()',
    'UPDATE public.user_roles SET onboarding_completed = onboarding_completed WHERE user_id = auth.uid()'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FAIL: no test member found (needs a non-admin member with a listing)';
  END IF;
  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'FAIL: not running as the authenticated role';
  END IF;

  FOREACH v_stmt IN ARRAY v_denied LOOP
    BEGIN
      EXECUTE v_stmt;
      RAISE EXCEPTION 'FAIL: a member could run: %', v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- expected
    END;
  END LOOP;

  FOREACH v_stmt IN ARRAY v_allowed LOOP
    BEGIN
      EXECUTE v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'FAIL: a member can no longer run: %', v_stmt;
    END;
  END LOOP;

  -- Listing limit: the member already has a listing, so a new one is blocked.
  BEGIN
    INSERT INTO public.listings (owner_user_id, title, description, city, country, status)
    VALUES (v_uid, 'Limit test', 'Limit test', 'Test', 'Test', 'draft');
    RAISE EXCEPTION 'FAIL: a member at the limit could insert another listing';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Your membership includes%' THEN
      RAISE EXCEPTION 'FAIL: unexpected error for the listing limit: %', SQLERRM;
    END IF;
  END;

  -- Own settings still readable, with the allowance.
  v_settings := public.get_my_settings();
  IF v_settings IS NULL OR NOT (v_settings ? 'max_listings') THEN
    RAISE EXCEPTION 'FAIL: get_my_settings has no max_listings';
  END IF;

  -- Admin RPCs refuse members.
  BEGIN
    PERFORM public.admin_set_max_listings(v_uid, 5);
    RAISE EXCEPTION 'FAIL: a member could call admin_set_max_listings';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Admins only' THEN
      RAISE EXCEPTION 'FAIL: unexpected error from admin_set_max_listings: %', SQLERRM;
    END IF;
  END;
END;
$$;

SELECT 'PASS: every member check behaved as expected (rolled back)' AS result;

ROLLBACK;
