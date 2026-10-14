-- Batch F1d: behaviour test for request_is_end_user() and ID checks.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Text the test writes starts with "F1d test 2099"; test file names start
-- with "f1d-". Needs a non-admin member with no pending ID check.

DO $$
DECLARE
  v_member uuid;
  v_idv uuid;
  v_own text;
  v_other_folder constant text := '00000000-0000-0000-0000-000000000000/draft/';
  v_stmt text;
  v_raised boolean;
  v_bool boolean;
  v_claims text;
BEGIN
  SELECT p.id INTO v_member FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE
    AND NOT EXISTS (SELECT 1 FROM public.manual_id_verifications m WHERE m.user_id = p.id AND m.status = 'pending')
  ORDER BY p.created_at LIMIT 1;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a non-admin member with no pending ID check';
  END IF;
  v_own := v_member::text || '/draft/';

  -- ── a) request_is_end_user(): false with no token, true only for members ──
  PERFORM set_config('request.jwt.claim.role', '', true);
  FOREACH v_claims IN ARRAY ARRAY['', '{}', '{"role":"service_role"}', '{"role":"anon"}'] LOOP
    PERFORM set_config('request.jwt.claims', v_claims, true);
    v_bool := public.request_is_end_user();
    IF v_bool IS NULL THEN
      RAISE EXCEPTION 'FAIL: (a) request_is_end_user() is NULL for claims %', quote_literal(v_claims);
    END IF;
    IF v_bool THEN
      RAISE EXCEPTION 'FAIL: (a) request_is_end_user() is true for claims %', quote_literal(v_claims);
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  IF public.request_is_end_user() IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: (a) request_is_end_user() is not true for a member';
  END IF;

  -- ── b) A database job with no token can write an ID check ───────────────
  -- Before F1d this stopped with "Please sign in.".
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    INSERT INTO public.manual_id_verifications (user_id, status, notes)
    VALUES (v_member, 'pending', 'F1d test 2099 server, no token') RETURNING id INTO v_idv;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: (b) a no-token server insert was refused: % %', SQLSTATE, SQLERRM;
  END;
  -- ... and the server can still update it (e.g. a review step).
  BEGIN
    UPDATE public.manual_id_verifications SET notes = 'F1d test 2099 server note' WHERE id = v_idv;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: (b) a no-token server update was refused: % %', SQLSTATE, SQLERRM;
  END;
  DELETE FROM public.manual_id_verifications WHERE id = v_idv;

  -- The same with the service_role claim (how the edge functions run).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO public.manual_id_verifications (user_id, status, notes)
    VALUES (v_member, 'pending', 'F1d test 2099 server, service role') RETURNING id INTO v_idv;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: (b) a service-role insert was refused: % %', SQLSTATE, SQLERRM;
  END;
  DELETE FROM public.manual_id_verifications WHERE id = v_idv;

  -- ── c) A member still sends only pending rows in their own folder ───────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH v_stmt IN ARRAY ARRAY[
    format('INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path, status) VALUES (%L, %L, %L, %L)',
           v_member, v_own || 'f1d-id.jpg', v_own || 'f1d-selfie.jpg', 'approved'),
    format('INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path) VALUES (%L, %L, %L)',
           v_member, v_other_folder || 'f1d-id.jpg', v_own || 'f1d-selfie.jpg'),
    format('INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path) VALUES (%L, %L, %L)',
           v_member, v_own || 'f1d-id.jpg', v_other_folder || 'f1d-selfie.jpg'),
    format('INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path, notes) VALUES (%L, %L, %L, %L)',
           v_member, v_own || 'f1d-id.jpg', v_own || 'f1d-selfie.jpg', 'F1d test 2099 member note')
  ] LOOP
    v_raised := false;
    BEGIN
      EXECUTE v_stmt;
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN RESET ROLE; RAISE EXCEPTION 'FAIL: (c) the member could run: %', v_stmt; END IF;
  END LOOP;
  BEGIN
    INSERT INTO public.manual_id_verifications (user_id, id_photo_path, selfie_path)
    VALUES (v_member, v_own || 'f1d-id.jpg', v_own || 'f1d-selfie.jpg') RETURNING id INTO v_idv;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: (c) a normal ID submission was refused: % %', SQLSTATE, SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF NOT EXISTS (SELECT 1 FROM public.manual_id_verifications WHERE id = v_idv AND user_id = v_member
                   AND status = 'pending' AND notes IS NULL) THEN
    RAISE EXCEPTION 'FAIL: (c) the member''s ID check is not a plain pending row';
  END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;
