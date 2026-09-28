-- Stage 4 (AI): behaviour test as members. Runs inside a transaction and
-- ROLLS BACK: nothing is changed.
--
-- Needs one ready Sit Story with both members and one other member.
-- Result: the last query returns "PASS"; anything unexpected stops with an
-- error starting "FAIL:".

BEGIN;

DO $$
DECLARE
  v_story uuid;
  v_sit uuid;
  v_owner uuid;
  v_sitter uuid;
  v_stranger uuid;
  v_json jsonb;
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
  IF v_stranger IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a third, non-admin member';
  END IF;

  -- Fixture: two photos with alt text, only one approved for the profile.
  UPDATE public.sit_stories
  SET photo_paths = ARRAY[v_sit::text || '/alt-a.jpg', v_sit::text || '/alt-b.jpg'],
      photo_alt = jsonb_build_object(v_sit::text || '/alt-a.jpg', 'A dog on a sofa', v_sit::text || '/alt-b.jpg', 'A cat by a window'),
      portfolio_status = 'approved',
      portfolio_photo_paths = ARRAY[v_sit::text || '/alt-a.jpg']
  WHERE id = v_story;

  -- Another member reading the profile story gets alt text for the approved photo only.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_json := public.get_portfolio_story(v_story);
  IF v_json->'photo_alt' ? (v_sit::text || '/alt-b.jpg') THEN
    RAISE EXCEPTION 'FAIL: alt text of a photo that isn''t approved reached another member';
  END IF;
  IF NOT (v_json->'photo_alt' ? (v_sit::text || '/alt-a.jpg')) THEN
    RAISE EXCEPTION 'FAIL: the approved photo''s alt text is missing';
  END IF;

  -- Members can't run the admin backfill.
  BEGIN
    PERFORM public.admin_queue_photo_alt_text(v_story);
    RAISE EXCEPTION 'FAIL: a member could run the admin alt text backfill';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- The two members see every photo's alt text.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_json := public.get_sit_story(v_story);
  IF NOT (v_json->'photo_alt' ? (v_sit::text || '/alt-b.jpg')) THEN
    RAISE EXCEPTION 'FAIL: the Pet Parent doesn''t get every photo''s alt text';
  END IF;
  RESET ROLE;

  -- An unknown share token returns nothing.
  v_json := public.get_shared_sit_story(repeat('0', 64));
  IF v_json IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: an unknown share token returned a story';
  END IF;
END;
$$;

SELECT 'PASS: every check behaved as expected (rolled back)' AS result;

ROLLBACK;
