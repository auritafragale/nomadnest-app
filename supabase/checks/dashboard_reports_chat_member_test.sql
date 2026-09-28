-- Dashboard, report evidence and guide photo paths: behaviour test AS A MEMBER.
-- Runs inside a transaction and ROLLS BACK: nothing is changed.
--
-- It picks a non-admin member who owns at least one listing. To test a
-- specific member, replace the SELECT in step 1 with their user id.
--
-- Result: the last query returns "PASS" if everything behaves as expected.
-- Any unexpected result stops with an error starting "FAIL:".

BEGIN;

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
  v_listing uuid;
  v_report uuid;
  v_summary jsonb;
  v_stories jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FAIL: no test member found (needs a non-admin member with a listing)';
  END IF;
  SELECT id INTO v_listing FROM public.listings WHERE owner_user_id = v_uid LIMIT 1;

  -- Dashboard functions return the caller's own data.
  v_summary := public.get_my_dashboard_summary();
  IF v_summary IS NULL
     OR NOT (v_summary ? 'current_sits' AND v_summary ? 'next_sits' AND v_summary ? 'new_applicants'
             AND v_summary ? 'pending_invites' AND v_summary ? 'reviews_due') THEN
    RAISE EXCEPTION 'FAIL: get_my_dashboard_summary is missing keys';
  END IF;
  v_stories := public.get_my_sit_stories();
  IF jsonb_typeof(v_stories) <> 'array' THEN
    RAISE EXCEPTION 'FAIL: get_my_sit_stories did not return a list';
  END IF;

  -- Reports: members can't set status or evidence directly.
  BEGIN
    INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, status)
    VALUES (v_uid, 'listing', v_listing, 'Test', 'resolved');
    RAISE EXCEPTION 'FAIL: a member could set a report''s status';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, evidence_paths)
    VALUES (v_uid, 'listing', v_listing, 'Test', ARRAY['someone/else.jpg']);
    RAISE EXCEPTION 'FAIL: a member could set evidence_paths on insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.reports SET evidence_paths = '{}' WHERE reporter_user_id = v_uid;
    RAISE EXCEPTION 'FAIL: a member could update reports';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A normal report still works (rolled back at the end).
  INSERT INTO public.reports (reporter_user_id, target_type, target_id, reason, details)
  VALUES (v_uid, 'listing', v_listing, 'Member test', 'Rolled back')
  RETURNING id INTO v_report;

  -- attach_report_evidence: only real files in the member's own folder for
  -- their own report.
  BEGIN
    PERFORM public.attach_report_evidence(v_report, ARRAY[v_uid::text || '/' || v_report::text || '/' || gen_random_uuid()::text || '.jpg']);
    RAISE EXCEPTION 'FAIL: attach_report_evidence accepted a file that doesn''t exist';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'A file is missing%' THEN
      RAISE EXCEPTION 'FAIL: unexpected error for a missing file: %', SQLERRM;
    END IF;
  END;
  BEGIN
    PERFORM public.attach_report_evidence(v_report, ARRAY[gen_random_uuid()::text || '/' || v_report::text || '/' || gen_random_uuid()::text || '.jpg']);
    RAISE EXCEPTION 'FAIL: attach_report_evidence accepted another member''s folder';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.attach_report_evidence(gen_random_uuid(), ARRAY['x']);
    RAISE EXCEPTION 'FAIL: attach_report_evidence accepted a report that isn''t the member''s';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Welcome Guide photos: a new row must point at a real file in the
  -- member's own folder for that listing.
  BEGIN
    INSERT INTO public.welcome_guide_photos (listing_id, owner_user_id, section, storage_path)
    VALUES (v_listing, v_uid, 'house', gen_random_uuid()::text || '/' || v_listing::text || '/' || gen_random_uuid()::text || '.jpg');
    RAISE EXCEPTION 'FAIL: a guide photo row could point into another member''s folder';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.welcome_guide_photos (listing_id, owner_user_id, section, storage_path)
    VALUES (v_listing, v_uid, 'house', v_uid::text || '/' || v_listing::text || '/' || gen_random_uuid()::text || '.jpg');
    RAISE EXCEPTION 'FAIL: a guide photo row could point at a file that doesn''t exist';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT 'PASS: every member check behaved as expected (rolled back)' AS result;

ROLLBACK;
