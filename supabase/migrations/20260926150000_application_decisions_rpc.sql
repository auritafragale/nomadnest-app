-- ═══════════════════════════════════════════════════════════════════════════
-- Server-side accept / shortlist / decline, with notifications
-- ═══════════════════════════════════════════════════════════════════════════
--
-- accept_application, shortlist_application and decline_application do the
-- whole decision in ONE transaction (everything succeeds or nothing does),
-- including the in-app notification rows. The push trigger on notifications
-- then sends the pushes. Emails are queued with pg_net to send-notification-
-- email (internal mode, Vault secret, skipInAppNotification); pg_net only
-- sends after the transaction commits, and a failure to queue an email is
-- caught so it can never roll back the decision.
--
-- These functions are SECURITY DEFINER, so the application/sit guard
-- triggers (which only restrict direct app writes, current_user
-- 'authenticated'/'anon') don't apply inside them; each function does its own
-- ownership and status checks first.
--
-- Notification wording is mirrored in the "application_status" case of
-- supabase/functions/_shared/email-templates.ts. Keep them in step.
--
-- SECRETS: read from Vault only. Never put a secret value in a migration.


-- ─── Shared: notification row + queued email ───────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_application_status(
  p_application_id uuid,
  p_status text,
  p_sit_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sitter uuid;
  v_listing_id uuid;
  v_listing text;
  v_owner text;
  v_start date;
  v_end date;
  v_dates text;
  v_title text;
  v_message text;
  v_url text;
  v_secret text;
BEGIN
  SELECT a.sitter_user_id, a.listing_id, l.title, NULLIF(TRIM(p.first_name), ''), sd.start_date, sd.end_date
    INTO v_sitter, v_listing_id, v_listing, v_owner, v_start, v_end
  FROM public.applications a
  JOIN public.listings l ON l.id = a.listing_id
  LEFT JOIN public.profiles p ON p.id = l.owner_user_id
  LEFT JOIN public.sit_dates sd ON sd.id = a.sit_dates_id
  WHERE a.id = p_application_id;

  IF v_sitter IS NULL THEN
    RETURN;
  END IF;

  v_owner := COALESCE(v_owner, 'The Pet Parent');
  v_listing := COALESCE(NULLIF(TRIM(v_listing), ''), 'the sit');

  -- "26 Sep to 27 Sep 2026" (year on both ends only if they differ).
  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    IF EXTRACT(YEAR FROM v_start) = EXTRACT(YEAR FROM v_end) THEN
      v_dates := to_char(v_start, 'FMDD Mon') || ' to ' || to_char(v_end, 'FMDD Mon YYYY');
    ELSE
      v_dates := to_char(v_start, 'FMDD Mon YYYY') || ' to ' || to_char(v_end, 'FMDD Mon YYYY');
    END IF;
  END IF;

  IF p_status = 'accepted' THEN
    v_title := 'You''ve been accepted';
    v_message := v_owner || ' has confirmed you for ' || v_listing
      || COALESCE(', ' || v_dates, '') || '. Say hello and start planning your stay.';
    v_url := '/dashboard?mode=sitter&appTab=accepted#my-applications';
  ELSIF p_status = 'shortlisted' THEN
    v_title := 'You''ve been shortlisted';
    v_message := v_owner || ' shortlisted you for ' || v_listing
      || '. They may reach out soon to get to know you.';
    v_url := '/dashboard?mode=sitter&appTab=pending#my-applications';
  ELSE
    v_title := 'Update on your application';
    v_message := v_owner || ' has chosen another Nomad for ' || v_listing
      || ' this time. There are plenty more sits waiting for you.';
    v_url := '/dashboard?mode=sitter&appTab=all#my-applications';
  END IF;

  -- In-app row (the push trigger sends the push from it).
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    v_sitter,
    'application_status',
    v_title,
    v_message,
    jsonb_build_object(
      'url', v_url,
      'status', p_status,
      'application_id', p_application_id::text,
      'listing_id', v_listing_id::text,
      'sit_id', p_sit_id::text
    )
  );

  -- Email: queued only; failures are caught so they never roll back.
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'internal_trigger_secret';

    IF v_secret IS NULL THEN
      RAISE WARNING 'internal_trigger_secret missing from vault; application status email skipped';
    ELSE
      PERFORM net.http_post(
        url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/send-notification-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_secret
        ),
        body    := jsonb_build_object(
          'type', 'application_status',
          'recipientUserId', v_sitter::text,
          'skipInAppNotification', true,
          'data', jsonb_build_object(
            'status', p_status,
            'listingTitle', v_listing,
            'ownerFirstName', v_owner,
            'dateRange', COALESCE(v_dates, ''),
            'url', v_url
          )
        )
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to queue application status email for %: %', p_application_id, SQLERRM;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_application_status(uuid, text, uuid) FROM PUBLIC, anon, authenticated;


-- ─── accept_application ─────────────────────────────────────────────────────

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

  RETURN jsonb_build_object(
    'sit_id', v_sit_id,
    'declined_count', COALESCE(array_length(v_declined, 1), 0)
  );
END;
$function$;


-- ─── shortlist_application ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.shortlist_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_status public.application_status;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again to shortlist this application.' USING ERRCODE = '28000';
  END IF;

  SELECT a.status, l.owner_user_id INTO v_status, v_owner
  FROM public.applications a
  JOIN public.listings l ON l.id = a.listing_id
  WHERE a.id = p_application_id
  FOR UPDATE OF a;

  IF NOT FOUND OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'Application not found.' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'applied' THEN
    RAISE EXCEPTION 'Only new applications can be shortlisted (this one is %).', v_status;
  END IF;

  UPDATE public.applications SET status = 'shortlisted' WHERE id = p_application_id;
  PERFORM public.notify_application_status(p_application_id, 'shortlisted', NULL);

  RETURN jsonb_build_object('status', 'shortlisted');
END;
$function$;


-- ─── decline_application ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decline_application(p_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_status public.application_status;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again to decline this application.' USING ERRCODE = '28000';
  END IF;

  SELECT a.status, l.owner_user_id INTO v_status, v_owner
  FROM public.applications a
  JOIN public.listings l ON l.id = a.listing_id
  WHERE a.id = p_application_id
  FOR UPDATE OF a;

  IF NOT FOUND OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'Application not found.' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('applied', 'shortlisted') THEN
    RAISE EXCEPTION 'This application can''t be declined because it is already %.', v_status;
  END IF;

  UPDATE public.applications SET status = 'declined' WHERE id = p_application_id;
  PERFORM public.notify_application_status(p_application_id, 'declined', NULL);

  RETURN jsonb_build_object('status', 'declined');
END;
$function$;


-- ─── Grants ─────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.accept_application(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shortlist_application(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shortlist_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_application(uuid) TO authenticated;
