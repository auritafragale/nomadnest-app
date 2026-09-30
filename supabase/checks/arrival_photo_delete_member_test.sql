-- Arrival Check-In photo delete: behaviour test as members. Runs inside a
-- transaction and ROLLS BACK: nothing is changed (no files are touched; the
-- storage rule is tested through its helper).
--
-- Needs one sit with a Nomad, one other member, and at least one review.
-- Result: the last query returns "PASS"; anything unexpected stops with an
-- error starting "FAIL:".

BEGIN;

DO $$
DECLARE
  v_sit uuid;
  v_nomad uuid;
  v_other uuid;
  v_review uuid;
  v_mine uuid;
  v_theirs uuid;
  v_evidence uuid;
  v_n integer;
BEGIN
  SELECT id, sitter_user_id INTO v_sit, v_nomad FROM public.sits WHERE sitter_user_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
  IF v_sit IS NULL THEN RAISE EXCEPTION 'FAIL: needs a sit with a Nomad'; END IF;
  SELECT id INTO v_other FROM public.profiles WHERE id <> v_nomad ORDER BY created_at LIMIT 1;
  IF v_other IS NULL THEN RAISE EXCEPTION 'FAIL: needs a second member'; END IF;
  SELECT id INTO v_review FROM public.reviews ORDER BY created_at DESC LIMIT 1;
  IF v_review IS NULL THEN RAISE EXCEPTION 'FAIL: needs at least one review (for the evidence row)'; END IF;

  -- Fixture rows (no files): the Nomad's photo, another member's photo, and
  -- the Nomad's photo that is attached to a flag as evidence.
  INSERT INTO public.arrival_vault_photos (sit_id, sitter_user_id, photo_url, taken_at)
  VALUES (v_sit, v_nomad, v_nomad::text || '/' || v_sit::text || '/member-test-mine.jpg', now())
  RETURNING id INTO v_mine;
  INSERT INTO public.arrival_vault_photos (sit_id, sitter_user_id, photo_url)
  VALUES (v_sit, v_other, v_other::text || '/' || v_sit::text || '/member-test-theirs.jpg')
  RETURNING id INTO v_theirs;
  INSERT INTO public.arrival_vault_photos (sit_id, sitter_user_id, photo_url)
  VALUES (v_sit, v_nomad, v_nomad::text || '/' || v_sit::text || '/member-test-evidence.jpg')
  RETURNING id INTO v_evidence;
  INSERT INTO public.review_flag_evidence (review_id, flag_key, photo_url)
  VALUES (v_review, 'flag_undisclosed_cameras', v_nomad::text || '/' || v_sit::text || '/member-test-evidence.jpg');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Own photo: yes.
  DELETE FROM public.arrival_vault_photos WHERE id = v_mine;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the Nomad could not delete their own photo'; END IF;

  -- Another member's photo: no.
  DELETE FROM public.arrival_vault_photos WHERE id = v_theirs;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Nomad deleted another member''s photo'; END IF;

  -- A photo attached as evidence: no.
  DELETE FROM public.arrival_vault_photos WHERE id = v_evidence;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: the Nomad deleted a photo attached as evidence'; END IF;

  -- Files: the deleted photo's file may go; the evidence file and a file whose row still exists may not.
  IF NOT public.arrival_photo_file_deletable(v_nomad::text || '/' || v_sit::text || '/member-test-mine.jpg') THEN
    RAISE EXCEPTION 'FAIL: the deleted photo''s file is not deletable';
  END IF;
  IF public.arrival_photo_file_deletable(v_nomad::text || '/' || v_sit::text || '/member-test-evidence.jpg') THEN
    RAISE EXCEPTION 'FAIL: an evidence file is deletable';
  END IF;
  IF public.arrival_photo_file_deletable(v_other::text || '/' || v_sit::text || '/member-test-theirs.jpg') THEN
    RAISE EXCEPTION 'FAIL: a file whose photo row still exists is deletable';
  END IF;
  RESET ROLE;

  -- The other photos are still there.
  IF (SELECT count(*) FROM public.arrival_vault_photos WHERE id IN (v_theirs, v_evidence)) <> 2 THEN
    RAISE EXCEPTION 'FAIL: a protected photo row is gone';
  END IF;
END;
$$;

SELECT 'PASS: every check behaved as expected (rolled back)' AS result;

ROLLBACK;
