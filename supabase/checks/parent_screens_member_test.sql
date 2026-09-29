-- Stage 3 (Pet Parent screens): behaviour test as members and a signed-out
-- visitor. Runs inside a transaction and ROLLS BACK: nothing is changed.
--
-- Needs one ready Sit Story whose Pet Parent and Nomad are both still
-- members, and one other member. Result: the last query returns "PASS";
-- anything unexpected stops with an error starting "FAIL:".

BEGIN;

DO $$
DECLARE
  v_story uuid;
  v_sit uuid;
  v_owner uuid;
  v_sitter uuid;
  v_stranger uuid;
  v_token text;
  v_token2 text;
  v_json jsonb;
  v_ok boolean;
  v_enabled boolean;
  i integer;
BEGIN
  SELECT id, sit_id, owner_user_id, sitter_user_id INTO v_story, v_sit, v_owner, v_sitter
  FROM public.sit_stories
  WHERE status = 'ready' AND owner_user_id IS NOT NULL AND sitter_user_id IS NOT NULL
  ORDER BY ready_at DESC NULLS LAST LIMIT 1;
  IF v_story IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a ready Sit Story with both members';
  END IF;
  SELECT id INTO v_stranger FROM public.profiles
  WHERE is_admin IS NOT TRUE AND id NOT IN (v_owner, v_sitter) ORDER BY created_at LIMIT 1;

  -- Fixture: the story is on the Nomad's profile with one test photo.
  -- Alt text for an approved photo and for one that isn't approved: only the
  -- first may reach the shared story (photo_alt, ai_dates_alt_text migration).
  UPDATE public.sit_stories
  SET portfolio_status = 'approved', portfolio_photo_paths = ARRAY[v_sit::text || '/member-test.jpg'],
      photo_alt = jsonb_build_object(v_sit::text || '/member-test.jpg', 'A dog on a sofa', v_sit::text || '/member-test-private.jpg', 'A cat by a window')
  WHERE id = v_story;
  DELETE FROM public.sit_story_share_links WHERE story_id = v_story;

  -- ── Share link: only the Pet Parent creates it ───────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.create_sit_story_share_link(v_story);
    RAISE EXCEPTION 'FAIL: another member could create a share link';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.sit_story_share_links LIMIT 1;
    RAISE EXCEPTION 'FAIL: a member could read share links directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_token := public.create_sit_story_share_link(v_story);
  IF v_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'FAIL: the share token isn''t 64 random hex characters';
  END IF;
  IF public.create_sit_story_share_link(v_story) <> v_token THEN
    RAISE EXCEPTION 'FAIL: a second tap created a second link';
  END IF;
  RESET ROLE;

  -- ── Signed-out visitors can't reach the story functions directly ─────────
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.get_shared_sit_story(v_token);
    RAISE EXCEPTION 'FAIL: a signed-out visitor could call get_shared_sit_story directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.hit_shared_sit_story(v_token);
    RAISE EXCEPTION 'FAIL: a signed-out visitor could call hit_shared_sit_story directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- ── What the shared-story function gets: city, first names, approved photos ─
  v_json := public.get_shared_sit_story(v_token);
  IF v_json IS NULL THEN
    RAISE EXCEPTION 'FAIL: an enabled link returned nothing';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_json) k
             WHERE k NOT IN ('title', 'story', 'story_days', 'city', 'month', 'owner_first_name', 'sitter_name', 'photo_paths', 'photo_alt')) THEN
    RAISE EXCEPTION 'FAIL: the shared story returns more than planned: %', (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_json) k);
  END IF;
  IF v_json->'photo_paths' <> to_jsonb(ARRAY[v_sit::text || '/member-test.jpg']) THEN
    RAISE EXCEPTION 'FAIL: the shared story shows photos that aren''t approved for the profile';
  END IF;
  -- photo_alt covers approved photos only.
  IF jsonb_typeof(v_json->'photo_alt') = 'object' AND EXISTS (
       SELECT 1 FROM jsonb_object_keys(v_json->'photo_alt') k WHERE NOT ((v_json->'photo_paths') ? k)) THEN
    RAISE EXCEPTION 'FAIL: the shared story has alt text for a photo that isn''t approved: %',
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_json->'photo_alt') k);
  END IF;

  -- Per-link rate limit: 60 a minute.
  FOR i IN 1..60 LOOP
    v_ok := public.hit_shared_sit_story(v_token);
  END LOOP;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'FAIL: the 60th view was refused';
  END IF;
  IF public.hit_shared_sit_story(v_token) THEN
    RAISE EXCEPTION 'FAIL: the 61st view in a minute was allowed';
  END IF;

  -- ── Withdrawing: only the Pet Parent; final; links go off; Nomad told ────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sitter, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.withdraw_sit_story_portfolio(v_story);
    RAISE EXCEPTION 'FAIL: the Nomad could use the Pet Parent''s withdraw';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.withdraw_sit_story_portfolio(v_story);
  RESET ROLE;

  IF (SELECT portfolio_status FROM public.sit_stories WHERE id = v_story) <> 'revoked'
     OR (SELECT cardinality(portfolio_photo_paths) FROM public.sit_stories WHERE id = v_story) <> 0 THEN
    RAISE EXCEPTION 'FAIL: withdrawing didn''t take the story and its photos off the profile';
  END IF;
  SELECT enabled INTO v_enabled FROM public.sit_story_share_links WHERE token = v_token;
  IF v_enabled THEN
    RAISE EXCEPTION 'FAIL: the share link stayed on after withdrawing';
  END IF;
  IF public.get_shared_sit_story(v_token) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a switched-off link still returns the story';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_sitter AND type = 'sit_story_portfolio_withdrawn'
                 AND data->>'story_id' = v_story::text AND created_at > now() - interval '1 minute') THEN
    RAISE EXCEPTION 'FAIL: the Nomad wasn''t told the story was withdrawn';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sitter, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.set_sit_story_portfolio_request(v_story, true);
    RAISE EXCEPTION 'FAIL: a withdrawn story could be requested again';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%can''t be added again%' THEN
      RAISE EXCEPTION 'FAIL: unexpected error re-requesting a withdrawn story: %', SQLERRM;
    END IF;
  END;
  RESET ROLE;

  -- ── A member leaving switches the story's links off ──────────────────────
  UPDATE public.sit_stories SET portfolio_status = 'none' WHERE id = v_story;
  v_token2 := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.sit_story_share_links (story_id, token, created_by) VALUES (v_story, v_token2, v_owner);
  UPDATE public.sit_stories SET sitter_user_id = NULL WHERE id = v_story;
  SELECT enabled INTO v_enabled FROM public.sit_story_share_links WHERE token = v_token2;
  IF v_enabled THEN
    RAISE EXCEPTION 'FAIL: a share link stayed on after a member left';
  END IF;
END;
$$;

SELECT 'PASS: every check behaved as expected (rolled back)' AS result;

ROLLBACK;
