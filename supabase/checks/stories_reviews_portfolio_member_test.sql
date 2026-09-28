-- Sit Story portfolio, review notifications and "Write it again" removal:
-- behaviour test AS MEMBERS. Runs inside a transaction and ROLLS BACK:
-- nothing is changed (the test story is approved only inside it).
--
-- Needs: one ready Sit Story whose Pet Parent and Nomad are both still
-- members, and one other non-admin member. Run it in the SQL editor as is.
--
-- Result: the last query returns "PASS" if everything behaves as expected.
-- Any unexpected result stops with an error starting "FAIL:".
--
-- Not covered here (it's an HTTP call, not SQL): a member calling
-- send-notification-email with type "review" gets 403. See the checklist.

BEGIN;

DO $$
DECLARE
  v_story uuid;
  v_sit uuid;
  v_owner uuid;
  v_sitter uuid;
  v_other uuid;
  v_path_a text;
  v_path_b text;
  v_json jsonb;
  v_paths text[];
  v_queue_before bigint;
  v_queue_after bigint;
  v_notifs_before bigint;
  v_notifs_after bigint;
  v_review_sit uuid;
  v_review_owner uuid;
  v_review_sitter uuid;
BEGIN
  -- ── Fixtures (as the SQL editor's own role) ──────────────────────────────
  SELECT st.id, st.sit_id, st.owner_user_id, st.sitter_user_id
    INTO v_story, v_sit, v_owner, v_sitter
  FROM public.sit_stories st
  WHERE st.status = 'ready' AND st.owner_user_id IS NOT NULL AND st.sitter_user_id IS NOT NULL
  ORDER BY st.ready_at DESC NULLS LAST
  LIMIT 1;
  IF v_story IS NULL THEN
    RAISE EXCEPTION 'FAIL: no ready Sit Story with both members to test with';
  END IF;

  SELECT p.id INTO v_other FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id NOT IN (v_owner, v_sitter)
  ORDER BY p.created_at LIMIT 1;
  IF v_other IS NULL THEN
    RAISE EXCEPTION 'FAIL: no third member to test with';
  END IF;

  -- Two test photo paths in this sit's folder, approved for the profile.
  v_path_a := v_sit::text || '/member-test-a.jpg';
  v_path_b := v_sit::text || '/member-test-b.jpg';
  UPDATE public.sit_stories
  SET portfolio_status = 'approved', portfolio_photo_paths = ARRAY[v_path_a, v_path_b]
  WHERE id = v_story;

  -- ── 1. A third member reads the approved story ───────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_json := public.get_portfolio_story(v_story);
  IF v_json IS NULL OR v_json->>'story' IS NULL THEN
    RAISE EXCEPTION 'FAIL: a signed-in member could not read an approved portfolio story';
  END IF;
  IF (v_json ? 'owner_user_id') OR (v_json ? 'portfolio_status') THEN
    RAISE EXCEPTION 'FAIL: get_portfolio_story returns more than the read-only view';
  END IF;
  RESET ROLE;

  -- ── 2. ...but not an unapproved one ──────────────────────────────────────
  UPDATE public.sit_stories SET portfolio_status = 'requested' WHERE id = v_story;
  SET LOCAL ROLE authenticated;
  IF public.get_portfolio_story(v_story) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a member could read a story that is not approved';
  END IF;
  RESET ROLE;
  UPDATE public.sit_stories SET portfolio_status = 'approved' WHERE id = v_story;

  -- ── 3. Only the owning Pet Parent can remove a photo ─────────────────────
  -- The third member:
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.remove_sit_story_portfolio_photo(v_story, v_path_a);
    RAISE EXCEPTION 'FAIL: another member could remove a portfolio photo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  -- The Nomad:
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sitter, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.remove_sit_story_portfolio_photo(v_story, v_path_a);
    RAISE EXCEPTION 'FAIL: the Nomad could remove a portfolio photo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- ── 4. The Pet Parent removes a photo; it never comes back ───────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_paths := public.remove_sit_story_portfolio_photo(v_story, v_path_a);
  IF v_path_a = ANY (v_paths) OR NOT (v_path_b = ANY (v_paths)) THEN
    RAISE EXCEPTION 'FAIL: removing a photo returned the wrong photos';
  END IF;
  BEGIN
    PERFORM public.remove_sit_story_portfolio_photo(v_story, v_path_a);
    RAISE EXCEPTION 'FAIL: a removed photo could be removed again (it came back)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'That photo isn%' THEN
      RAISE EXCEPTION 'FAIL: unexpected error removing a removed photo: %', SQLERRM;
    END IF;
  END;

  -- ── 5. Revoking or re-approving an approved story is refused ─────────────
  BEGIN
    PERFORM public.decide_sit_story_portfolio(v_story, 'revoke');
    RAISE EXCEPTION 'FAIL: the Pet Parent could revoke an approved story';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Invalid decision.' THEN
      RAISE EXCEPTION 'FAIL: unexpected error for revoke: %', SQLERRM;
    END IF;
  END;
  BEGIN
    PERFORM public.decide_sit_story_portfolio(v_story, 'approve', ARRAY[v_path_a]);
    RAISE EXCEPTION 'FAIL: the Pet Parent could re-approve (and re-add a photo)';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'There%s no request to approve.' THEN
      RAISE EXCEPTION 'FAIL: unexpected error for re-approve: %', SQLERRM;
    END IF;
  END;
  RESET ROLE;

  -- The third member no longer gets the removed photo.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_json := public.get_portfolio_story(v_story);
  IF v_json->'photo_paths' @> to_jsonb(v_path_a) THEN
    RAISE EXCEPTION 'FAIL: a removed photo still comes back in get_portfolio_story';
  END IF;
  RESET ROLE;

  -- ── 6. One review → exactly one notification request, no direct rows ─────
  -- pg_net queues the call inside this transaction (it's sent only after a
  -- commit, so here it's rolled back). send-notification-email then writes
  -- exactly one in-app row, which pushes once.
  SELECT s.id, s.owner_user_id, s.sitter_user_id INTO v_review_sit, v_review_owner, v_review_sitter
  FROM public.sits s
  WHERE s.owner_user_id IS NOT NULL AND s.sitter_user_id IS NOT NULL
  ORDER BY s.created_at DESC LIMIT 1;

  SELECT count(*) INTO v_queue_before FROM net.http_request_queue
  WHERE url LIKE '%/send-notification-email' AND convert_from(body, 'UTF8') LIKE '%"type": "review"%';
  SELECT count(*) INTO v_notifs_before FROM public.notifications WHERE type = 'review';

  INSERT INTO public.reviews (sit_id, reviewer_user_id, reviewee_user_id, rating, text)
  VALUES (v_review_sit, v_review_owner, v_review_sitter, 5, 'Member test review (rolled back)');

  SELECT count(*) INTO v_queue_after FROM net.http_request_queue
  WHERE url LIKE '%/send-notification-email' AND convert_from(body, 'UTF8') LIKE '%"type": "review"%';
  SELECT count(*) INTO v_notifs_after FROM public.notifications WHERE type = 'review';

  IF v_queue_after - v_queue_before <> 1 THEN
    RAISE EXCEPTION 'FAIL: one review queued % review notifications (expected exactly 1). Is internal_trigger_secret in Vault?',
      v_queue_after - v_queue_before;
  END IF;
  IF v_notifs_after <> v_notifs_before THEN
    RAISE EXCEPTION 'FAIL: a review wrote notification rows directly (would double up with the function)';
  END IF;

  -- ── 7. "Write it again" is really gone ───────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'sit_stories'
               AND column_name IN ('rewrites_used', 'rewrite_requested_at')) THEN
    RAISE EXCEPTION 'FAIL: the rewrite columns still exist';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'request_sit_story_rewrite' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'FAIL: request_sit_story_rewrite still exists';
  END IF;
END;
$$;

SELECT 'PASS: every check behaved as expected (rolled back)' AS result;

ROLLBACK;
