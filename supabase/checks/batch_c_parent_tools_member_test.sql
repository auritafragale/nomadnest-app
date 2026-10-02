-- Batch C (Pet Parent tools): behaviour test, acting as real members.
--
-- One DO block. It always ends with an exception, so the whole statement rolls
-- back and nothing it does is ever kept:
--   PASS:  ERROR: PASS_ROLLED_BACK: every check behaved as expected
--   FAIL:  ERROR: FAIL: <what went wrong>
-- Needs: a non-admin member with a Nomad profile, a non-admin member with no
-- listing (the test gives them a temporary one), and a third non-admin member.
-- Test data is marked with dates in 2099, the title "Test listing 2099" and the
-- last names Testparent / Testnomad, so the leftover check can prove nothing
-- stayed.
-- Server-side updates of profiles clear the request claims first, or
-- prevent_privilege_escalation (correctly) refuses them.

DO $$
DECLARE
  v_owner uuid;
  v_nomad uuid;
  v_other uuid;
  v_listing uuid;
  v_range1 uuid;
  v_range2 uuid;
  v_booked uuid;
  v_app1 uuid;
  v_app2 uuid;
  v_json jsonb;
  v_txt text;
  v_n integer;
  v_status text;
  v_bad text;
  v_before integer;
BEGIN
  -- ── Members ────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT sp.user_id INTO v_nomad
  FROM public.sitter_profiles sp JOIN public.profiles p ON p.id = sp.user_id
  WHERE p.is_admin IS NOT TRUE
  ORDER BY p.created_at LIMIT 1;

  -- An owner who has no listing yet, so the temporary one fits their limit.
  SELECT p.id INTO v_owner FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id <> v_nomad
    AND NOT EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p.id)
  ORDER BY p.created_at LIMIT 1;

  SELECT p.id INTO v_other FROM public.profiles p
  WHERE p.is_admin IS NOT TRUE AND p.id NOT IN (v_owner, v_nomad)
  ORDER BY p.created_at LIMIT 1;

  IF v_nomad IS NULL OR v_owner IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'FAIL: needs a non-admin Nomad, a non-admin member with no listing and a third non-admin member';
  END IF;

  -- A temporary listing for the owner (as the server).
  INSERT INTO public.listings (owner_user_id, title, status, city, country, owner_declaration_accepted_at)
  VALUES (v_owner, 'Test listing 2099', 'published', 'Testville', 'Testland', now())
  RETURNING id INTO v_listing;

  -- Known private values to look for (rolled back with everything else).
  UPDATE public.profiles SET last_name = 'Testparent', phone_number = '+447700900111' WHERE id = v_owner;
  UPDATE public.profiles SET last_name = 'Testnomad', phone_number = '+447700900222' WHERE id = v_nomad;
  UPDATE public.sitter_profiles SET phone = '+447700900333' WHERE user_id = v_nomad;
  UPDATE public.owner_profiles SET phone = '+447700900444' WHERE user_id = v_owner;
  -- The third member has no membership and no verified ID.
  UPDATE public.profiles
  SET id_verified = false, founding_member = false, membership_status = 'inactive', membership_type = NULL
  WHERE id = v_other;

  -- ── Test data (as the server) ──────────────────────────────────────────
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, '2099-03-01', '2099-03-14') RETURNING id INTO v_range1;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date) VALUES (v_listing, '2099-05-01', '2099-05-10') RETURNING id INTO v_range2;
  INSERT INTO public.sit_dates (listing_id, start_date, end_date, status) VALUES (v_listing, '2099-07-01', '2099-07-10', 'booked') RETURNING id INTO v_booked;
  INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, status, message)
  VALUES (v_listing, v_range1, v_nomad, 'applied', 'Test application 2099') RETURNING id INTO v_app1;
  INSERT INTO public.applications (listing_id, sit_dates_id, sitter_user_id, status, message)
  VALUES (v_listing, v_range2, v_nomad, 'applied', 'Test application 2099') RETURNING id INTO v_app2;
  -- A confirmed sit between the owner and the Nomad, for the phone checks.
  INSERT INTO public.sits (listing_id, sit_dates_id, sitter_user_id, owner_user_id, status, confirmed_at)
  VALUES (v_listing, v_booked, v_nomad, v_owner, 'confirmed', now());

  -- ── 1. A member who isn't the owner can't use any new RPC ──────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM * FROM public.get_listing_applicants(v_listing);
    RAISE EXCEPTION 'FAIL: a non-owner read the applicants';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.unshortlist_application(v_app1);
    RAISE EXCEPTION 'FAIL: a non-owner called unshortlist_application';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.decline_application(v_app1, 'no');
    RAISE EXCEPTION 'FAIL: a non-owner declined an application';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.remove_listing_dates(v_range2);
    RAISE EXCEPTION 'FAIL: a non-owner removed dates';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT public.mark_applications_seen(ARRAY[v_app1]) INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: a non-owner marked applications as seen'; END IF;

  -- No membership and no verified ID: can't create a listing.
  BEGIN
    INSERT INTO public.listings (owner_user_id, title, status, city, country)
    VALUES (v_other, 'Gate test 2099', 'draft', 'Test', 'Test');
    RAISE EXCEPTION 'FAIL: a member without membership or ID created a listing';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT ILIKE '%membership%' AND SQLERRM NOT ILIKE '%row-level security%' THEN
      RAISE EXCEPTION 'FAIL: listing insert was refused for the wrong reason: %', SQLERRM;
    END IF;
  END;
  RESET ROLE;

  -- ── 2. The Nomad can't unshortlist or read another listing's applicants ─
  UPDATE public.applications SET status = 'shortlisted' WHERE id = v_app1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nomad, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.unshortlist_application(v_app1);
    RAISE EXCEPTION 'FAIL: a Nomad un-shortlisted an application';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.get_listing_applicants(v_listing);
    RAISE EXCEPTION 'FAIL: a Nomad read another listing''s applicants';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- The Nomad can't set owner_seen_at on their own application directly.
  BEGIN
    UPDATE public.applications SET owner_seen_at = now() WHERE id = v_app1;
    IF FOUND THEN RAISE EXCEPTION 'FAIL: a Nomad changed owner_seen_at directly'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- ── 3. The owner: applicants without last names or phones ──────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT jsonb_agg(to_jsonb(a))::text INTO v_txt FROM public.get_listing_applicants(v_listing) a;
  IF v_txt IS NULL OR v_txt NOT LIKE '%' || v_app1::text || '%' THEN
    RAISE EXCEPTION 'FAIL: the owner could not see their applicants';
  END IF;
  IF v_txt ILIKE '%Testnomad%' OR v_txt ILIKE '%Testparent%' THEN
    RAISE EXCEPTION 'FAIL: get_listing_applicants returned a last name';
  END IF;
  IF v_txt LIKE '%7700900%' OR v_txt ILIKE '%"email"%' OR v_txt ILIKE '%last_name%' THEN
    RAISE EXCEPTION 'FAIL: get_listing_applicants returned contact details';
  END IF;

  -- Mark seen, un-shortlist (back to applied, no notification).
  SELECT public.mark_applications_seen(ARRAY[v_app1]) INTO v_n;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: the owner could not mark an application seen'; END IF;
  RESET ROLE;
  SELECT count(*) INTO v_before FROM public.notifications WHERE user_id = v_nomad;
  SET LOCAL ROLE authenticated;
  PERFORM public.unshortlist_application(v_app1);
  SELECT status::text INTO v_status FROM public.applications WHERE id = v_app1;
  IF v_status <> 'applied' THEN RAISE EXCEPTION 'FAIL: unshortlist left the status as %', v_status; END IF;
  RESET ROLE;
  SELECT count(*) INTO v_n FROM public.notifications WHERE user_id = v_nomad;
  IF v_n <> v_before THEN RAISE EXCEPTION 'FAIL: un-shortlisting sent the Nomad a notification'; END IF;
  SET LOCAL ROLE authenticated;

  -- Decline with a long note full of contact details.
  v_json := public.decline_application(
    v_app1,
    '  Call me on +44 7700 900123 or write to me@example.com, see www.example.com, ' || repeat('x', 400)
  );
  v_txt := v_json->>'note';
  IF v_txt IS NULL OR length(v_txt) > 300 THEN
    RAISE EXCEPTION 'FAIL: the decline note was not limited to 300 characters (%)', length(v_txt);
  END IF;
  IF v_txt LIKE '%7700%' OR v_txt LIKE '%@%' OR v_txt ILIKE '%example.com%' THEN
    RAISE EXCEPTION 'FAIL: the decline note kept contact details: %', left(v_txt, 80);
  END IF;
  RESET ROLE;
  SELECT message INTO v_txt FROM public.notifications
  WHERE user_id = v_nomad AND data->>'application_id' = v_app1::text
  ORDER BY created_at DESC LIMIT 1;
  IF v_txt IS NULL OR v_txt NOT ILIKE 'Thank you for applying.%' THEN
    RAISE EXCEPTION 'FAIL: the declined Nomad did not get the kind note (got: %)', left(COALESCE(v_txt, 'nothing'), 80);
  END IF;
  IF v_txt LIKE '%7700%' OR v_txt LIKE '%@%' THEN
    RAISE EXCEPTION 'FAIL: the decline notification kept contact details';
  END IF;

  -- One-argument decline still works.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.decline_application(v_app2);
  RESET ROLE;
  UPDATE public.applications SET status = 'applied' WHERE id = v_app2;

  -- ── 4. remove_listing_dates ─────────────────────────────────────────────
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.remove_listing_dates(v_booked);
    RAISE EXCEPTION 'FAIL: booked dates were removed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT ILIKE '%booked%' THEN RAISE; END IF;
  END;
  v_json := public.remove_listing_dates(v_range2);
  IF (v_json->>'notified')::integer <> 1 THEN
    RAISE EXCEPTION 'FAIL: remove_listing_dates told % Nomads, expected 1', v_json->>'notified';
  END IF;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.sit_dates WHERE id = v_range2) THEN
    RAISE EXCEPTION 'FAIL: the removed range is still there';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_nomad AND type = 'listing_dates_removed') THEN
    RAISE EXCEPTION 'FAIL: the Nomad was not told the dates were removed';
  END IF;

  -- ── 5. Publishing needs membership and a verified ID ───────────────────
  UPDATE public.listings SET status = 'draft' WHERE id = v_listing;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.profiles SET id_verified = false, founding_member = false, membership_status = 'inactive'
  WHERE id = v_owner;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.listings SET status = 'published' WHERE id = v_listing;
    RAISE EXCEPTION 'FAIL: a member without membership or ID published a listing';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT ILIKE '%membership%' THEN RAISE; END IF;
  END;
  -- Editing the existing draft still works.
  UPDATE public.listings SET title = title WHERE id = v_listing;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.profiles SET id_verified = true, founding_member = true WHERE id = v_owner;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.listings SET status = 'published' WHERE id = v_listing;
  RESET ROLE;

  -- ── 6. Phones: a Nomad and a Pet Parent with a confirmed sit together ──
  FOR v_n IN 1..2 LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', CASE WHEN v_n = 1 THEN v_nomad ELSE v_owner END, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      SELECT phone_number INTO v_txt FROM public.profiles
      WHERE id = CASE WHEN v_n = 1 THEN v_owner ELSE v_nomad END;
      IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'FAIL: profiles.phone_number of the other member was readable'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      SELECT phone INTO v_txt FROM public.sitter_profiles WHERE user_id = v_nomad;
      IF v_n = 2 AND v_txt IS NOT NULL THEN RAISE EXCEPTION 'FAIL: sitter_profiles.phone was readable by the Pet Parent'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      SELECT phone INTO v_txt FROM public.owner_profiles WHERE user_id = v_owner;
      IF v_n = 1 AND v_txt IS NOT NULL THEN RAISE EXCEPTION 'FAIL: owner_profiles.phone was readable by the Nomad'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    -- get_my_contact_info only ever answers for the caller.
    SELECT phone_number INTO v_txt FROM public.get_my_contact_info();
    IF v_txt IS DISTINCT FROM (CASE WHEN v_n = 1 THEN '+447700900222' ELSE '+447700900111' END) THEN
      RAISE EXCEPTION 'FAIL: get_my_contact_info gave someone else''s number';
    END IF;
    RESET ROLE;
  END LOOP;

  -- No view a member can read has a phone column.
  SELECT string_agg(c.relname || '.' || a.attname, ', ') INTO v_bad
  FROM pg_class c
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('v', 'm')
    AND a.attname ILIKE '%phone%'
    AND a.attname NOT IN ('phone_verified', 'phone_line_type')
    AND has_table_privilege('authenticated', c.oid, 'SELECT');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL: views with a phone column members can read: %', v_bad; END IF;

  -- No function members can run reads a phone column, except their own.
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.prosrc ~* '(phone_number|sp\.phone\M|op\.phone\M|\.phone\M)'
    AND p.proname NOT IN ('get_my_contact_info', 'set_my_profile_phone')
    -- Admin functions check is_admin before reading anything.
    AND p.prosrc !~* 'is_admin';
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL: functions members can run that read a phone column: %', v_bad; END IF;

  RAISE EXCEPTION 'PASS_ROLLED_BACK: every check behaved as expected';
END;
$$;

-- Leftover check (run after the test): every count must be 0.
-- SELECT
--   (SELECT count(*) FROM public.sit_dates WHERE start_date >= '2099-01-01') AS test_dates,
--   (SELECT count(*) FROM public.applications WHERE message = 'Test application 2099') AS test_applications,
--   (SELECT count(*) FROM public.listings WHERE title IN ('Gate test 2099', 'Test listing 2099')) AS test_listings,
--   (SELECT count(*) FROM public.profiles WHERE last_name IN ('Testparent', 'Testnomad')) AS test_names,
--   (SELECT count(*) FROM public.profiles WHERE phone_number LIKE '+447700900%') AS test_phones,
--   (SELECT count(*) FROM public.notifications WHERE message LIKE '%2099%') AS test_notifications;
