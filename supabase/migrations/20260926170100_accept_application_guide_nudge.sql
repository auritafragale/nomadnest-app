-- ═══════════════════════════════════════════════════════════════════════════
-- accept_application: add the owner's Welcome Guide nudge
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Same function as 20260926150000 (all checks, the single transaction and the
-- sitter notifications are unchanged), plus: if get_guide_completion says the
-- listing's guide is under 100%, the owner gets an in-app notification (and so a
-- push) "Get ready for {sitter first name}" that opens the Welcome Guide.
-- The nudge runs in its own sub-block, so it can never roll back an accept.
-- Requires 20260926170000_welcome_guide_v2.sql (get_guide_completion).

CREATE OR REPLACE FUNCTION public.accept_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_dates_status public.sit_date_status;
  v_dates_listing uuid;
  v_sit_id uuid;
  v_declined uuid[];
  v_id uuid;
  v_completion jsonb;
  v_sitter_first text;
  v_days integer;
  v_when text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again to accept this application.' USING ERRCODE = '28000';
  END IF;

  SELECT a.id, a.status, a.listing_id, a.sit_dates_id, a.sitter_user_id, l.owner_user_id
    INTO v_app
  FROM public.applications a
  JOIN public.listings l ON l.id = a.listing_id
  WHERE a.id = p_application_id
  FOR UPDATE OF a;

  IF NOT FOUND OR v_app.owner_user_id <> v_uid THEN
    RAISE EXCEPTION 'Application not found.' USING ERRCODE = '42501';
  END IF;
  IF v_app.status NOT IN ('applied', 'shortlisted') THEN
    RAISE EXCEPTION 'This application can''t be accepted because it is already %.', v_app.status;
  END IF;

  SELECT sd.status, sd.listing_id INTO v_dates_status, v_dates_listing
  FROM public.sit_dates sd
  WHERE sd.id = v_app.sit_dates_id
  FOR UPDATE;

  IF NOT FOUND OR v_dates_listing <> v_app.listing_id THEN
    RAISE EXCEPTION 'These dates are no longer part of the listing.';
  END IF;
  IF v_dates_status = 'booked'
     OR EXISTS (
       SELECT 1 FROM public.sits s
       WHERE s.sit_dates_id = v_app.sit_dates_id
         AND s.status IN ('confirmed', 'in_progress')
     ) THEN
    RAISE EXCEPTION 'These dates are already booked.';
  END IF;

  UPDATE public.applications SET status = 'accepted' WHERE id = v_app.id;

  INSERT INTO public.sits (listing_id, sit_dates_id, sitter_user_id, owner_user_id, status, confirmed_at)
  VALUES (v_app.listing_id, v_app.sit_dates_id, v_app.sitter_user_id, v_uid, 'confirmed', now())
  RETURNING id INTO v_sit_id;

  UPDATE public.sit_dates SET status = 'booked' WHERE id = v_app.sit_dates_id;

  WITH d AS (
    UPDATE public.applications
    SET status = 'declined'
    WHERE sit_dates_id = v_app.sit_dates_id
      AND id <> v_app.id
      AND status IN ('applied', 'shortlisted')
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_declined FROM d;

  PERFORM public.notify_application_status(v_app.id, 'accepted', v_sit_id);
  FOREACH v_id IN ARRAY v_declined LOOP
    PERFORM public.notify_application_status(v_id, 'declined', NULL);
  END LOOP;

  -- Welcome Guide nudge for the owner, if the guide isn't complete yet.
  -- Its own block: a problem here never undoes the accept.
  BEGIN
    v_completion := public.get_guide_completion(v_app.listing_id);
    IF COALESCE((v_completion->>'percent')::integer, 0) < 100 THEN
      SELECT NULLIF(TRIM(first_name), '') INTO v_sitter_first
      FROM public.profiles WHERE id = v_app.sitter_user_id;
      v_sitter_first := COALESCE(v_sitter_first, 'your sitter');

      SELECT sd.start_date - CURRENT_DATE INTO v_days
      FROM public.sit_dates sd WHERE sd.id = v_app.sit_dates_id;

      v_when := CASE
        WHEN v_days IS NULL OR v_days <= 0 THEN 'Your sit starts today.'
        WHEN v_days = 1 THEN 'Your sit starts in 1 day.'
        ELSE 'Your sit starts in ' || v_days || ' days.'
      END;

      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        v_uid,
        'guide_nudge',
        'Get ready for ' || v_sitter_first,
        v_when || ' Finish your Welcome Guide so ' || v_sitter_first || ' has everything they need.',
        jsonb_build_object(
          'url', '/listing/' || v_app.listing_id::text || '/welcome-guide',
          'listing_id', v_app.listing_id::text,
          'sit_id', v_sit_id::text
        )
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Welcome Guide nudge skipped for listing %: %', v_app.listing_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'sit_id', v_sit_id,
    'declined_count', COALESCE(array_length(v_declined, 1), 0)
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.accept_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_application(uuid) TO authenticated;
