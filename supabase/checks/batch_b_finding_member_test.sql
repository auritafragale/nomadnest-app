-- Batch B (finding each other): behaviour test. Runs inside a transaction and
-- ROLLS BACK: nothing is changed.
-- Result: the last query returns "PASS"; anything unexpected stops with an
-- error starting "FAIL:".

BEGIN;

DO $$
DECLARE
  v_member uuid;
  v_listing uuid;
  v_owner uuid;
  v_spots integer;
  v_cap integer;

BEGIN
  SELECT id INTO v_member FROM public.profiles WHERE is_admin IS NOT TRUE ORDER BY created_at LIMIT 1;
  SELECT id, owner_user_id INTO v_listing, v_owner FROM public.listings ORDER BY created_at DESC LIMIT 1;
  IF v_member IS NULL OR v_listing IS NULL THEN RAISE EXCEPTION 'FAIL: needs a non-admin member and a listing'; END IF;

  -- A cache row for the listing (as the server would write it).
  INSERT INTO public.nomad_match_cache (listing_id, owner_user_id, results)
  VALUES (v_listing, v_owner, '[{"sitter_user_id":"00000000-0000-0000-0000-000000000000","score":90,"reason":"test"}]')
  ON CONFLICT (listing_id) DO UPDATE SET results = EXCLUDED.results;

  -- Signed out: founding spots yes, the cache no.
  SET LOCAL ROLE anon;
  SELECT spots_left, cap INTO v_spots, v_cap FROM public.public_founding_spots();
  IF v_spots IS NULL OR v_cap IS NULL OR v_spots < 0 OR v_spots > v_cap THEN
    RAISE EXCEPTION 'FAIL: public_founding_spots gave % of % to a signed-out visitor', v_spots, v_cap;
  END IF;
  BEGIN
    PERFORM 1 FROM public.nomad_match_cache LIMIT 1;
    RAISE EXCEPTION 'FAIL: a signed-out visitor could read the match cache';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A member: founding spots yes; the cache no, even the owner of the listing.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT spots_left INTO v_spots FROM public.public_founding_spots();
  IF v_spots IS NULL THEN RAISE EXCEPTION 'FAIL: a member could not read founding spots'; END IF;
  BEGIN
    PERFORM 1 FROM public.nomad_match_cache LIMIT 1;
    RAISE EXCEPTION 'FAIL: a member could read the match cache';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.nomad_match_cache (listing_id, owner_user_id) VALUES (v_listing, v_owner);
    RAISE EXCEPTION 'FAIL: a member could write the match cache';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- Spots left never below zero, even with more founding members than the cap.
  UPDATE public.founding_member_codes SET max_uses = 0;
  SELECT spots_left INTO v_spots FROM public.public_founding_spots();
  IF v_spots <> 0 THEN RAISE EXCEPTION 'FAIL: spots left went below zero (%)', v_spots; END IF;
  -- (The cache row going with its listing is checked in the proof file: ON DELETE CASCADE.)
END;
$$;

SELECT 'PASS: every check behaved as expected (rolled back)' AS result;

ROLLBACK;
