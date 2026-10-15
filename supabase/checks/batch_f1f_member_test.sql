-- Batch F1f: behaviour test for the ID upload rule, acting as a member.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- It adds storage.objects rows the way an upload does (no file is stored).
-- Test file names start with "f1f-". Needs a non-admin member.

DO $$
DECLARE
  v_member uuid;
  v_name text;
  v_raised boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT p.id INTO v_member FROM public.profiles p WHERE p.is_admin IS NOT TRUE ORDER BY p.created_at LIMIT 1;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a non-admin member';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Refused: an .html or .svg file, even in the member's own folder (and
  -- whatever the case of the extension).
  FOREACH v_name IN ARRAY ARRAY[
    v_member::text || '/draft/f1f-page.html',
    v_member::text || '/draft/f1f-logo.svg',
    v_member::text || '/draft/f1f-logo.SVG',
    v_member::text || '/draft/f1f-noextension'
  ] LOOP
    v_raised := false;
    BEGIN
      INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('id-verification-documents', v_name, v_member::text);
    EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
    END;
    IF NOT v_raised THEN
      RESET ROLE;
      RAISE EXCEPTION 'FAIL: the member could add %', v_name;
    END IF;
  END LOOP;

  -- Refused: a .jpg in someone else's folder (the own-folder check is kept).
  v_raised := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('id-verification-documents', '00000000-0000-0000-0000-000000000000/draft/f1f-id.jpg', v_member::text);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  IF NOT v_raised THEN
    RESET ROLE;
    RAISE EXCEPTION 'FAIL: the member could add a file to another member''s folder';
  END IF;

  -- Allowed: a .jpg (and an upper-case .JPG, and a .pdf) in their own folder.
  FOREACH v_name IN ARRAY ARRAY[
    v_member::text || '/draft/f1f-id.jpg',
    v_member::text || '/draft/f1f-selfie.JPG',
    v_member::text || '/draft/f1f-id.pdf'
  ] LOOP
    BEGIN
      INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('id-verification-documents', v_name, v_member::text);
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      RAISE EXCEPTION 'FAIL: the member could not add % (% %)', v_name, SQLSTATE, SQLERRM;
    END;
  END LOOP;
  RESET ROLE;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;
