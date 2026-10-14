-- ═══════════════════════════════════════════════════════════════════════════
-- Batch F1: every notification is sent by the server
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until now some notifications were sent from the member's browser. If their
-- sign-in had ended, the app closed or they lost signal, the other member got
-- no bell, push or email although the action was saved. Like
-- notify_new_message (D2), each event now notifies from a trigger on the
-- table where it happens, in the same transaction:
--   * exactly one in-app row for the right member (never the person who did
--     it), with notifications.dedupe_key so the same event never notifies
--     twice;
--   * the push follows from push_on_notification_insert (the D2 push
--     choices);
--   * the email goes through request_internal_function('send-notification-
--     email', …) when notification_allowed says so (always-on types ignore
--     the switches, as today). If that call fails the in-app row stays.
-- Notifications say what happened and who did it, never what a member
-- wrote (no cancel reason, application or invitation message, daily update
-- text, decline note, City Chat reply or report details). The app's screens
-- still show the full text to the right member.
--
-- Events: applying, withdrawing, inviting, cancelling a sit (either side,
-- and the quiet wording when a block cancelled it), changing dates with
-- applicants, proposing / accepting / declining new dates, a daily update,
-- an ID check approved or rejected, a new report (for the founders).
-- Nothing here logs member text.


-- ─── 1. Dedupe key ─────────────────────────────────────────────────────────

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_key ON public.notifications (user_id, dedupe_key);


-- ─── 2. Helpers ────────────────────────────────────────────────────────────

-- "12 to 25 Oct", "28 Sep to 3 Oct", "28 Dec 2026 to 3 Jan 2027".
CREATE OR REPLACE FUNCTION public.nn_date_range(p_start date, p_end date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_start IS NULL OR p_end IS NULL THEN NULL
    WHEN date_trunc('month', p_start) = date_trunc('month', p_end)
      THEN to_char(p_start, 'FMDD') || ' to ' || to_char(p_end, 'FMDD Mon')
    WHEN date_part('year', p_start) = date_part('year', p_end)
      THEN to_char(p_start, 'FMDD Mon') || ' to ' || to_char(p_end, 'FMDD Mon')
    ELSE to_char(p_start, 'FMDD Mon YYYY') || ' to ' || to_char(p_end, 'FMDD Mon YYYY')
  END;
$$;

REVOKE ALL ON FUNCTION public.nn_date_range(date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nn_first_name(p_user uuid, p_fallback text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT NULLIF(btrim(first_name), '') FROM public.profiles WHERE id = p_user), p_fallback);
$$;

REVOKE ALL ON FUNCTION public.nn_first_name(uuid, text) FROM PUBLIC, anon, authenticated;

-- One in-app row (once per dedupe key) and, if the member's choices allow,
-- the email with the same words. Returns true when a row was created.
CREATE OR REPLACE FUNCTION public.notify_member(
  p_user uuid,
  p_type text,
  p_title text,
  p_message text,
  p_url text,
  p_data jsonb,
  p_dedupe text,
  p_cta text DEFAULT NULL,
  p_email boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data, dedupe_key)
  VALUES (p_user, p_type, p_title, p_message, COALESCE(p_data, '{}'::jsonb) || jsonb_build_object('url', p_url), p_dedupe)
  ON CONFLICT (user_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN false; -- already notified about this event
  END IF;

  IF p_email AND public.notification_allowed(p_user, p_type, 'email') THEN
    BEGIN
      PERFORM public.request_internal_function('send-notification-email', jsonb_build_object(
        'type', p_type,
        'recipientUserId', p_user::text,
        'skipInAppNotification', true,
        'data', jsonb_build_object('title', p_title, 'message', p_message, 'url', p_url, 'cta', COALESCE(p_cta, ''))
      ));
    EXCEPTION WHEN OTHERS THEN
      -- The in-app row (and so the push) stays. No member data in the log.
      RAISE WARNING 'notify_member: % email not queued for notification %', p_type, v_id;
    END;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_member(uuid, text, text, text, text, jsonb, text, text, boolean) FROM PUBLIC, anon, authenticated;

-- The city and dates of an application, invitation or sit, for the words.
CREATE OR REPLACE FUNCTION public.nn_listing_place(p_listing_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT NULLIF(btrim(city), '') FROM public.listings WHERE id = p_listing_id), 'your home');
$$;

REVOKE ALL ON FUNCTION public.nn_listing_place(uuid) FROM PUBLIC, anon, authenticated;


-- ─── 3. Applying and withdrawing ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_application_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_city text;
  v_dates text;
  v_nomad text;
BEGIN
  SELECT l.owner_user_id, COALESCE(NULLIF(btrim(l.city), ''), 'your home'), public.nn_date_range(sd.start_date, sd.end_date)
    INTO v_owner, v_city, v_dates
  FROM public.listings l
  LEFT JOIN public.sit_dates sd ON sd.id = NEW.sit_dates_id
  WHERE l.id = NEW.listing_id;
  IF v_owner IS NULL OR v_owner = NEW.sitter_user_id THEN
    RETURN NULL;
  END IF;
  v_nomad := public.nn_first_name(NEW.sitter_user_id, 'A Nomad');

  IF TG_OP = 'INSERT' AND NEW.status = 'applied' THEN
    PERFORM public.notify_member(
      v_owner, 'new_application', 'New application',
      v_nomad || ' applied for your sit in ' || v_city || COALESCE(', ' || v_dates, '') || '.',
      '/applications',
      jsonb_build_object('application_id', NEW.id::text, 'listing_id', NEW.listing_id::text),
      'new_application:' || NEW.id::text, 'View the application');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'withdrawn' AND OLD.status IS DISTINCT FROM 'withdrawn' THEN
    PERFORM public.notify_member(
      v_owner, 'application_withdrawn', 'Application withdrawn',
      v_nomad || ' withdrew their application for your sit in ' || v_city || COALESCE(', ' || v_dates, '') || '. Those dates are still open.',
      '/applications',
      jsonb_build_object('application_id', NEW.id::text, 'listing_id', NEW.listing_id::text),
      'application_withdrawn:' || NEW.id::text, 'View your applicants');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block applying or withdrawing.
  RAISE WARNING 'notify_application_events skipped for application %', NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_application_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_application_events ON public.applications;
CREATE TRIGGER notify_application_events
AFTER INSERT OR UPDATE OF status ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.notify_application_events();


-- ─── 4. Inviting (the existing trigger, now with the email and no message) ─

CREATE OR REPLACE FUNCTION public.notify_sitter_on_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_city text;
  v_dates text;
BEGIN
  IF NEW.sitter_user_id IS NULL OR NEW.sitter_user_id = NEW.owner_user_id THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(NULLIF(btrim(l.city), ''), 'their home'), public.nn_date_range(sd.start_date, sd.end_date)
    INTO v_city, v_dates
  FROM public.listings l
  LEFT JOIN public.sit_dates sd ON sd.id = NEW.sit_dates_id
  WHERE l.id = NEW.listing_id;

  PERFORM public.notify_member(
    NEW.sitter_user_id, 'invite', 'New sit invitation',
    public.nn_first_name(NEW.owner_user_id, 'A Pet Parent') || ' invited you to sit in ' || COALESCE(v_city, 'their home')
      || COALESCE(', ' || v_dates, '') || '.',
    '/dashboard?mode=sitter&section=invites',
    jsonb_build_object('listing_id', NEW.listing_id::text, 'invite_id', NEW.id::text),
    'invite:' || NEW.id::text, 'View the invitation');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_sitter_on_invite skipped for invitation %', NEW.id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_sitter_on_invite() FROM PUBLIC, anon, authenticated;


-- ─── 5. A sit cancelled, from either side ──────────────────────────────────
-- The other member is told who cancelled and when; the reason is in the
-- chat ("Open the app to see why"). When a block cancelled it, the wording
-- never mentions blocking (the E1 copy).

CREATE OR REPLACE FUNCTION public.notify_sit_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_recipient uuid;
  v_name text;
  v_city text;
  v_dates text;
  v_to_nomad boolean;
BEGIN
  IF v_actor IS NULL OR v_actor NOT IN (NEW.owner_user_id, NEW.sitter_user_id) THEN
    RETURN NULL; -- server-side cancellations tell members themselves
  END IF;
  v_recipient := CASE WHEN v_actor = NEW.owner_user_id THEN NEW.sitter_user_id ELSE NEW.owner_user_id END;
  IF v_recipient IS NULL THEN
    RETURN NULL;
  END IF;
  v_to_nomad := v_recipient = NEW.sitter_user_id;
  v_name := public.nn_first_name(v_actor, CASE WHEN v_to_nomad THEN 'The Pet Parent' ELSE 'Your Nomad' END);
  SELECT COALESCE(NULLIF(btrim(COALESCE(NEW.snapshot_city, l.city)), ''), 'your sit'),
         public.nn_date_range(COALESCE(sd.start_date, NEW.snapshot_start_date), COALESCE(sd.end_date, NEW.snapshot_end_date))
    INTO v_city, v_dates
  FROM (SELECT 1) one
  LEFT JOIN public.listings l ON l.id = NEW.listing_id
  LEFT JOIN public.sit_dates sd ON sd.id = NEW.sit_dates_id;

  IF public.blocked_between(NEW.owner_user_id, NEW.sitter_user_id) THEN
    IF v_to_nomad THEN
      PERFORM public.notify_member(
        v_recipient, 'sit_cancelled',
        'Your sit in ' || v_city || COALESCE(' for ' || v_dates, '') || ' was cancelled',
        'The Pet Parent cancelled this sit. Those dates are free again, so you can apply for another sit.',
        '/browse-sits', jsonb_build_object('sit_id', NEW.id::text), 'sit_cancelled:' || NEW.id::text, 'Find another sit');
    ELSE
      PERFORM public.notify_member(
        v_recipient, 'sit_cancelled',
        v_name || ' cancelled your sit' || COALESCE(' for ' || v_dates, ''),
        'Your dates are open again, so Nomads can apply. You can also invite Nomads who are free then.',
        '/browse-sitters', jsonb_build_object('sit_id', NEW.id::text), 'sit_cancelled:' || NEW.id::text,
        COALESCE('Find a Nomad for ' || v_dates, 'Find a Nomad'));
    END IF;
  ELSE
    PERFORM public.notify_member(
      v_recipient, 'sit_cancelled', 'Sit cancelled',
      v_name || ' cancelled your sit' || CASE WHEN v_to_nomad THEN ' in ' || v_city ELSE '' END
        || COALESCE(' for ' || v_dates, '') || '. Open the app to see why.',
      CASE WHEN v_to_nomad THEN '/dashboard?appTab=cancelled#my-applications' ELSE '/applications?status=cancelled' END,
      jsonb_build_object('sit_id', NEW.id::text), 'sit_cancelled:' || NEW.id::text, 'See the cancelled sit');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_sit_cancelled skipped for sit %', NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_sit_cancelled() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_sit_cancelled ON public.sits;
CREATE TRIGGER notify_sit_cancelled
AFTER UPDATE OF status ON public.sits
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status IN ('confirmed', 'in_progress'))
EXECUTE FUNCTION public.notify_sit_cancelled();


-- ─── 6. Listing dates changed with applicants ──────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_listing_dates_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_owner_name text;
  v_city text;
  v_dates text := public.nn_date_range(NEW.start_date, NEW.end_date);
  a record;
BEGIN
  SELECT l.owner_user_id, COALESCE(NULLIF(btrim(l.city), ''), 'a home') INTO v_owner, v_city
  FROM public.listings l WHERE l.id = NEW.listing_id;
  v_owner_name := public.nn_first_name(v_owner, 'The Pet Parent');

  FOR a IN
    SELECT DISTINCT ap.sitter_user_id FROM public.applications ap
    WHERE ap.sit_dates_id = NEW.id AND ap.status IN ('applied', 'shortlisted')
      AND ap.sitter_user_id IS DISTINCT FROM v_owner
  LOOP
    PERFORM public.notify_member(
      a.sitter_user_id, 'listing_dates_changed', 'Sit dates changed',
      v_owner_name || ' changed the dates of the sit in ' || v_city || ' you applied for to ' || v_dates
        || '. Please check they still work for you.',
      '/listing/' || NEW.listing_id::text,
      jsonb_build_object('listing_id', NEW.listing_id::text, 'sit_dates_id', NEW.id::text),
      'listing_dates_changed:' || NEW.id::text || ':' || NEW.start_date::text || ':' || NEW.end_date::text,
      'View the listing');
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_listing_dates_changed skipped for dates %', NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_listing_dates_changed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_listing_dates_changed ON public.sit_dates;
CREATE TRIGGER notify_listing_dates_changed
AFTER UPDATE OF start_date, end_date ON public.sit_dates
FOR EACH ROW
WHEN (NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date)
EXECUTE FUNCTION public.notify_listing_dates_changed();


-- ─── 7. New dates proposed, accepted or declined ───────────────────────────

CREATE OR REPLACE FUNCTION public.notify_sit_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  v_city text;
  v_other uuid;
  v_url_for text;
  v_new text := public.nn_date_range(NEW.proposed_start_date, NEW.proposed_end_date);
BEGIN
  SELECT si.owner_user_id, si.sitter_user_id, COALESCE(NULLIF(btrim(COALESCE(si.snapshot_city, l.city)), ''), 'your sit') AS city
    INTO s
  FROM public.sits si LEFT JOIN public.listings l ON l.id = si.listing_id
  WHERE si.id = NEW.sit_id;
  IF s.owner_user_id IS NULL OR s.sitter_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_city := s.city;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    v_other := CASE WHEN NEW.requested_by = s.owner_user_id THEN s.sitter_user_id ELSE s.owner_user_id END;
    PERFORM public.notify_member(
      v_other, 'sit_reschedule_proposed', 'New dates proposed',
      public.nn_first_name(NEW.requested_by, 'The other member') || ' proposed new dates for your sit in ' || v_city
        || ': ' || v_new || '. Accept or decline them in the app.',
      CASE WHEN v_other = s.sitter_user_id THEN '/dashboard?mode=sitter' ELSE '/dashboard?mode=owner' END,
      jsonb_build_object('sit_id', NEW.sit_id::text, 'request_id', NEW.id::text),
      'sit_reschedule_proposed:' || NEW.id::text, 'Review the new dates');
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') THEN
    v_other := CASE WHEN NEW.requested_by = s.owner_user_id THEN s.sitter_user_id ELSE s.owner_user_id END;
    v_url_for := CASE WHEN NEW.requested_by = s.sitter_user_id THEN '/dashboard?mode=sitter' ELSE '/dashboard?mode=owner' END;
    IF NEW.status = 'accepted' THEN
      PERFORM public.notify_member(
        NEW.requested_by, 'sit_reschedule_accepted', 'New dates accepted',
        public.nn_first_name(v_other, 'The other member') || ' accepted the new dates for your sit in ' || v_city || ': ' || v_new || '.',
        v_url_for, jsonb_build_object('sit_id', NEW.sit_id::text, 'request_id', NEW.id::text),
        'sit_reschedule_accepted:' || NEW.id::text, 'View the sit');
    ELSE
      PERFORM public.notify_member(
        NEW.requested_by, 'sit_reschedule_declined', 'New dates declined',
        public.nn_first_name(v_other, 'The other member') || ' declined the new dates for your sit in ' || v_city
          || '. The original dates stay as they are.',
        v_url_for, jsonb_build_object('sit_id', NEW.sit_id::text, 'request_id', NEW.id::text),
        'sit_reschedule_declined:' || NEW.id::text, 'View the sit');
    END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_sit_reschedule skipped for request %', NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_sit_reschedule() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_sit_reschedule ON public.sit_reschedule_requests;
CREATE TRIGGER notify_sit_reschedule
AFTER INSERT OR UPDATE OF status ON public.sit_reschedule_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_sit_reschedule();


-- ─── 8. Daily update (the existing trigger, now with the email, no text) ───

CREATE OR REPLACE FUNCTION public.notify_owner_on_sit_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_sitter uuid;
  v_city text;
  v_nomad text;
  v_photos integer := COALESCE(cardinality(NEW.photo_paths), 0);
  v_title text;
  v_message text;
  v_label text;
BEGIN
  SELECT s.owner_user_id, s.sitter_user_id, COALESCE(NULLIF(btrim(COALESCE(s.snapshot_city, l.city)), ''), 'your home')
    INTO v_owner, v_sitter, v_city
  FROM public.sits s
  LEFT JOIN public.listings l ON l.id = s.listing_id
  WHERE s.id = NEW.sit_id;

  IF v_owner IS NULL OR v_owner = NEW.author_user_id THEN
    RETURN NEW;
  END IF;
  v_nomad := public.nn_first_name(v_sitter, 'Your Nomad');

  IF NEW.kind = 'daily_update' THEN
    IF NEW.flagged THEN
      v_title := 'Daily update with a note for you';
      v_message := v_nomad || ' added a note for you to today''s update. Open it to read it.';
    ELSE
      v_title := 'New daily update';
      v_message := 'New daily update from ' || v_nomad
        || CASE WHEN v_photos = 1 THEN ' with 1 photo' WHEN v_photos > 1 THEN ' with ' || v_photos || ' photos' ELSE '' END || '.';
    END IF;
  ELSE
    v_label := CASE NEW.kind
      WHEN 'pets_fed' THEN 'Pets Fed'
      WHEN 'meds_given' THEN 'Meds Given'
      WHEN 'walk_completed' THEN 'Walk Completed'
      ELSE 'Check-in'
    END;
    v_title := v_label || '. ' || v_city;
    v_message := v_nomad || ' posted a "' || v_label || '" update.';
  END IF;

  PERFORM public.notify_member(
    v_owner, 'sit_checkin', v_title, v_message, '/sits/' || NEW.sit_id::text,
    jsonb_build_object('sit_id', NEW.sit_id::text, 'checkin_id', NEW.id::text),
    'sit_checkin:' || NEW.id::text, 'See today''s update', NEW.kind = 'daily_update');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_owner_on_sit_checkin skipped for update %', NEW.id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_owner_on_sit_checkin() FROM PUBLIC, anon, authenticated;


-- ─── 9. ID check approved or rejected ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_id_verification_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    PERFORM public.notify_member(
      NEW.user_id, 'id_verification_approved', 'ID Verified ✓',
      'Your ID has been verified. Your profile now shows the ID Verified badge.',
      '/complete-profile', jsonb_build_object('verification_id', NEW.id::text),
      'id_verification_approved:' || NEW.id::text, 'Go to your profile');
  ELSIF NEW.status = 'rejected' THEN
    -- The reason is the NomadNest team's, never a member's.
    PERFORM public.notify_member(
      NEW.user_id, 'id_verification_rejected', 'ID verification unsuccessful',
      'We couldn''t approve your ID' || COALESCE(': ' || NULLIF(btrim(NEW.notes), ''), '')
        || '. Please send it again from Verify your identity.',
      '/verify-identity', jsonb_build_object('verification_id', NEW.id::text),
      'id_verification_rejected:' || NEW.id::text, 'Verify your identity');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_id_verification_decision skipped for %', NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_id_verification_decision() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_id_verification_decision ON public.manual_id_verifications;
CREATE TRIGGER notify_id_verification_decision
AFTER UPDATE OF status ON public.manual_id_verifications
FOR EACH ROW
WHEN (NEW.status IN ('approved', 'rejected') AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_id_verification_decision();


-- ─── 10. A new report, for the founders ────────────────────────────────────
-- Each admin gets a bell (and so a push), and one founders' email goes out
-- through notify-new-report. Never the report's details text.

CREATE OR REPLACE FUNCTION public.notify_new_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_what text := CASE NEW.target_type::text
    WHEN 'user' THEN 'a member'
    WHEN 'listing' THEN 'a listing'
    WHEN 'message' THEN 'a chat message'
    WHEN 'city_chat_message' THEN 'a City Chat message'
    WHEN 'sit_story' THEN 'a Sit Story'
    WHEN 'review' THEN 'a review'
    ELSE 'something' END;
  a record;
BEGIN
  FOR a IN
    SELECT p.id FROM public.profiles p
    WHERE p.is_admin IS TRUE AND p.id IS DISTINCT FROM NEW.reporter_user_id
  LOOP
    PERFORM public.notify_member(
      a.id, 'new_report', 'New report',
      'A member reported ' || v_what || '. Open Admin, Reports to review it.',
      '/admin/reports', jsonb_build_object('report_id', NEW.id::text),
      'new_report:' || NEW.id::text, NULL, false);
  END LOOP;
  BEGIN
    PERFORM public.request_internal_function('notify-new-report', jsonb_build_object('reportId', NEW.id::text));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_new_report: founders email not queued for report %', NEW.id;
  END;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_report skipped for report %', NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_new_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_new_report ON public.reports;
CREATE TRIGGER notify_new_report
AFTER INSERT ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.notify_new_report();


-- ─── 11. Existing notifications without member text ───────────────────────

-- A decline: the Pet Parent's note stays in the app, never in the push or
-- email ("Open the app to read Marta's note.").
CREATE OR REPLACE FUNCTION public.notify_application_status(
  p_application_id uuid,
  p_status text,
  p_sit_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
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
  v_status text := CASE WHEN p_status = 'declined_by_owner' THEN 'declined' ELSE p_status END;
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
  ELSIF p_status = 'declined_by_owner' THEN
    v_title := 'Update on your application';
    v_message := 'Thank you for applying. ' || v_owner || ' isn''t going ahead with you for '
      || COALESCE(v_dates, 'these dates') || ' this time.'
      || CASE WHEN NULLIF(btrim(p_note), '') IS NOT NULL
              THEN ' Open the app to read ' || v_owner || '''s note.' ELSE '' END;
    v_url := '/dashboard?mode=sitter&appTab=all#my-applications';
  ELSE
    v_title := 'Update on your application';
    v_message := v_owner || ' has chosen another Nomad for ' || v_listing
      || ' this time. There are plenty more sits waiting for you.';
    v_url := '/dashboard?mode=sitter&appTab=all#my-applications';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    v_sitter,
    'application_status',
    v_title,
    v_message,
    jsonb_build_object(
      'url', v_url,
      'status', v_status,
      'application_id', p_application_id::text,
      'listing_id', v_listing_id::text,
      'sit_id', p_sit_id::text
    )
  );

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
            'status', v_status,
            'manual', (p_status = 'declined_by_owner'),
            'note', '',
            'hasNote', (NULLIF(btrim(p_note), '') IS NOT NULL),
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

REVOKE ALL ON FUNCTION public.notify_application_status(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- City Chat replies: who replied, never what they wrote.
CREATE OR REPLACE FUNCTION public.notify_city_chat_thread_subscribers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_replier_name   text;
  v_room_id        uuid;
  v_thread_preview text;
  v_subscriber     record;
BEGIN
  IF NEW.parent_message_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (a) Auto-subscribe the replier, independently of the notifications.
  BEGIN
    INSERT INTO public.city_chat_thread_subscriptions (thread_message_id, user_id)
    VALUES (NEW.parent_message_id, NEW.sender_user_id)
    ON CONFLICT (thread_message_id, user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to auto-subscribe replier % to thread %: %',
        NEW.sender_user_id, NEW.parent_message_id, SQLERRM;
  END;

  -- (b) Notify every other subscriber of this thread, in-app.
  BEGIN
    SELECT COALESCE(NULLIF(TRIM(p.first_name), ''), 'Someone')
      INTO v_replier_name
    FROM public.profiles p
    WHERE p.id = NEW.sender_user_id;
    v_replier_name := COALESCE(v_replier_name, 'Someone');

    SELECT m.room_id, NULL::text
      INTO v_room_id, v_thread_preview
    FROM public.city_chat_messages m
    WHERE m.id = NEW.parent_message_id;

    FOR v_subscriber IN
      SELECT s.user_id
      FROM public.city_chat_thread_subscriptions s
      WHERE s.thread_message_id = NEW.parent_message_id
        AND s.user_id <> NEW.sender_user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        v_subscriber.user_id,
        'city_chat_thread_reply',
        'New reply in a thread you follow',
        v_replier_name || ' replied. Open City Chat to read it.',
        jsonb_build_object(
          'room_id', v_room_id,
          'thread_message_id', NEW.parent_message_id,
          'url', '/city-chat/' || v_room_id::text || '?thread=' || NEW.parent_message_id::text
        )
      );
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to notify subscribers of city chat thread %: %',
        NEW.parent_message_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_city_chat_thread_subscribers() FROM PUBLIC, anon, authenticated;

-- Block with a confirmed sit: notify_sit_cancelled now tells the other
-- member (once, with the quiet E1 words), so this no longer sends its own.
CREATE OR REPLACE FUNCTION public.cancel_sits_on_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  FOR s IN
    SELECT si.id, si.owner_user_id, si.sitter_user_id, si.sit_dates_id,
           COALESCE(l.city, si.snapshot_city) AS city,
           COALESCE(sd.start_date, si.snapshot_start_date) AS start_date,
           COALESCE(sd.end_date, si.snapshot_end_date) AS end_date
    FROM public.sits si
    LEFT JOIN public.listings l ON l.id = si.listing_id
    LEFT JOIN public.sit_dates sd ON sd.id = si.sit_dates_id
    WHERE si.status = 'confirmed'
      AND ((si.owner_user_id = NEW.blocker_id AND si.sitter_user_id = NEW.blocked_id)
        OR (si.owner_user_id = NEW.blocked_id AND si.sitter_user_id = NEW.blocker_id))
  LOOP
    UPDATE public.sits
    SET status = 'cancelled', cancelled_at = now(), cancelled_from_status = 'confirmed'
    WHERE id = s.id AND status = 'confirmed';

    IF s.sit_dates_id IS NOT NULL AND s.end_date >= current_date THEN
      UPDATE public.sit_dates SET status = 'open' WHERE id = s.sit_dates_id;
    END IF;

    -- notify_sit_cancelled tells the other member, never mentioning blocking.
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_sits_on_block() FROM PUBLIC, anon, authenticated;

