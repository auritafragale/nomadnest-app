-- Batch F1b: one notification per invitation or application, however many
-- date ranges; the invitation's chat note no longer sends its own
-- "New message" alert.
--
-- 1. post_invite_note(): the Pet Parent's one chat note after inviting,
--    posted quietly (no new_message bell, push or email) and never twice.
-- 2. notify_new_message(): skips messages posted with nn.quiet_message on.
--    Patched in place from the live definition, so nothing else changes.
-- 3. sitter_invites: the row trigger notify_sitter_on_invite is replaced by a
--    statement trigger that sends one notification per Pet Parent, Nomad and
--    listing in each insert.
-- 4. applications: new applications are notified by a statement trigger, one
--    per Nomad and listing in each insert. notify_application_events keeps
--    only the withdraw branch and fires on UPDATE OF status only.
--
-- No member-written text goes into any notification, push or email.

-- ── 1. The invitation's chat note ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_invite_note(p_conversation_id uuid, p_sitter_user_id uuid, p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body constant text := 'Hi! I''d love to invite you to sit at my home. I''ve sent you a formal invitation — please check your notifications.';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in.' USING ERRCODE = '42501';
  END IF;

  IF p_sitter_user_id IS NULL OR p_sitter_user_id = v_uid OR NOT EXISTS (
    SELECT 1 FROM public.sitter_invites i
    WHERE i.listing_id = p_listing_id
      AND i.owner_user_id = v_uid
      AND i.sitter_user_id = p_sitter_user_id
      AND i.status IN ('pending', 'viewed')
      AND i.created_at > now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'No recent invitation.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND ((c.owner_user_id = v_uid AND c.sitter_user_id = p_sitter_user_id)
        OR (c.owner_user_id = p_sitter_user_id AND c.sitter_user_id = v_uid))
  ) OR NOT public.conversation_open_to_me(p_conversation_id) THEN
    RAISE EXCEPTION 'This chat isn''t available.' USING ERRCODE = '42501';
  END IF;

  -- One note, however many ranges or clicks (two clicks at once wait here).
  PERFORM pg_advisory_xact_lock(hashtextextended('post_invite_note:' || p_conversation_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_user_id = v_uid
      AND m.body = v_body
      AND m.created_at > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  -- The invitation already told the Nomad: no "New message" alert for this.
  PERFORM set_config('nn.quiet_message', 'on', true);
  INSERT INTO public.messages (conversation_id, sender_user_id, body)
  VALUES (p_conversation_id, v_uid, v_body);
  PERFORM set_config('nn.quiet_message', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.post_invite_note(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_invite_note(uuid, uuid, uuid) TO authenticated;

-- ── 2. notify_new_message: skip quiet messages ────────────────────────────
-- Adds "OR current_setting('nn.quiet_message', true) = 'on'" to the first
-- skip condition of the LIVE definition, leaving everything else exactly as
-- it is. Stops (and applies nothing) if that condition isn't found once.
DO $patch$
DECLARE
  v_def text;
  v_anchor constant text := 'IF NEW.sender_user_id IS NULL';
  v_count integer;
BEGIN
  v_def := pg_get_functiondef('public.notify_new_message()'::regprocedure);
  IF position('nn.quiet_message' IN v_def) > 0 THEN
    RETURN; -- already patched
  END IF;
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'notify_new_message: expected its first skip condition (%) once, found % times. Nothing was changed.', v_anchor, v_count;
  END IF;
  EXECUTE replace(v_def, v_anchor, v_anchor || E'\n     OR current_setting(''nn.quiet_message'', true) = ''on''');
END;
$patch$;

-- ── 3. Invitations: one notification per insert ───────────────────────────
CREATE OR REPLACE FUNCTION public.notify_sitter_on_invite_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g record;
  v_city text;
  v_dates text;
  v_owner_name text;
BEGIN
  FOR g IN
    SELECT n.listing_id, n.owner_user_id, n.sitter_user_id,
           count(*)::integer AS n,
           (array_agg(n.id ORDER BY sd.start_date NULLS LAST, n.created_at, n.id))[1] AS first_id,
           (array_agg(n.sit_dates_id ORDER BY sd.start_date NULLS LAST, n.created_at, n.id))[1] AS first_dates_id,
           jsonb_agg(n.id::text ORDER BY sd.start_date NULLS LAST, n.created_at, n.id) AS ids
    FROM new_rows n
    LEFT JOIN public.sit_dates sd ON sd.id = n.sit_dates_id
    WHERE n.sitter_user_id IS NOT NULL AND n.sitter_user_id IS DISTINCT FROM n.owner_user_id
    GROUP BY n.listing_id, n.owner_user_id, n.sitter_user_id
  LOOP
    BEGIN
      SELECT COALESCE(NULLIF(btrim(l.city), ''), 'their home') INTO v_city
      FROM public.listings l WHERE l.id = g.listing_id;
      v_owner_name := public.nn_first_name(g.owner_user_id, 'A Pet Parent');

      IF g.n = 1 THEN
        SELECT public.nn_date_range(sd.start_date, sd.end_date) INTO v_dates
        FROM public.sit_dates sd WHERE sd.id = g.first_dates_id;
        PERFORM public.notify_member(
          g.sitter_user_id, 'invite', 'New sit invitation',
          v_owner_name || ' invited you to sit in ' || COALESCE(v_city, 'their home') || COALESCE(', ' || v_dates, '') || '.',
          '/dashboard?mode=sitter&section=invites',
          jsonb_build_object('listing_id', g.listing_id::text, 'invite_id', g.first_id::text),
          'invite:' || g.first_id::text, 'View the invitation');
      ELSE
        PERFORM public.notify_member(
          g.sitter_user_id, 'invite', 'New sit invitation',
          v_owner_name || ' invited you to sit in ' || COALESCE(v_city, 'their home') || ' for ' || g.n || ' date ranges.',
          '/dashboard?mode=sitter&section=invites',
          jsonb_build_object('listing_id', g.listing_id::text, 'invite_id', g.first_id::text, 'invite_ids', g.ids),
          'invite:' || g.first_id::text, 'View the invitation');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_sitter_on_invite_batch skipped invitation % (%)', g.first_id, SQLSTATE;
    END;
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block inviting.
  RAISE WARNING 'notify_sitter_on_invite_batch skipped (%)', SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_sitter_on_invite_batch() FROM PUBLIC, anon, authenticated;

-- Detach the old row trigger, whatever it is called, then drop its function.
DO $drop$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tg.tgname FROM pg_trigger tg
    WHERE tg.tgrelid = 'public.sitter_invites'::regclass AND NOT tg.tgisinternal
      AND tg.tgfoid = to_regprocedure('public.notify_sitter_on_invite()')
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.sitter_invites', t.tgname);
  END LOOP;
END;
$drop$;
DROP FUNCTION IF EXISTS public.notify_sitter_on_invite();

DROP TRIGGER IF EXISTS notify_sitter_on_invite_batch ON public.sitter_invites;
CREATE TRIGGER notify_sitter_on_invite_batch
  AFTER INSERT ON public.sitter_invites
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.notify_sitter_on_invite_batch();

-- ── 4. Applications: one notification per insert ──────────────────────────
CREATE OR REPLACE FUNCTION public.notify_new_applications_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g record;
  v_owner uuid;
  v_city text;
  v_dates text;
  v_nomad text;
BEGIN
  FOR g IN
    SELECT n.listing_id, n.sitter_user_id,
           count(*)::integer AS n,
           (array_agg(n.id ORDER BY sd.start_date NULLS LAST, n.created_at, n.id))[1] AS first_id,
           (array_agg(n.sit_dates_id ORDER BY sd.start_date NULLS LAST, n.created_at, n.id))[1] AS first_dates_id,
           jsonb_agg(n.id::text ORDER BY sd.start_date NULLS LAST, n.created_at, n.id) AS ids
    FROM new_rows n
    LEFT JOIN public.sit_dates sd ON sd.id = n.sit_dates_id
    WHERE n.status = 'applied'
    GROUP BY n.listing_id, n.sitter_user_id
  LOOP
    BEGIN
      v_owner := NULL;
      SELECT l.owner_user_id, COALESCE(NULLIF(btrim(l.city), ''), 'your home')
        INTO v_owner, v_city
      FROM public.listings l WHERE l.id = g.listing_id;
      IF v_owner IS NULL OR v_owner = g.sitter_user_id THEN
        CONTINUE;
      END IF;
      v_nomad := public.nn_first_name(g.sitter_user_id, 'A Nomad');

      IF g.n = 1 THEN
        SELECT public.nn_date_range(sd.start_date, sd.end_date) INTO v_dates
        FROM public.sit_dates sd WHERE sd.id = g.first_dates_id;
        PERFORM public.notify_member(
          v_owner, 'new_application', 'New application',
          v_nomad || ' applied for your sit in ' || v_city || COALESCE(', ' || v_dates, '') || '.',
          '/applications',
          jsonb_build_object('application_id', g.first_id::text, 'listing_id', g.listing_id::text),
          'new_application:' || g.first_id::text, 'View the application');
      ELSE
        PERFORM public.notify_member(
          v_owner, 'new_application', 'New application',
          v_nomad || ' applied for ' || g.n || ' date ranges at your sit in ' || v_city || '.',
          '/applications',
          jsonb_build_object('application_id', g.first_id::text, 'listing_id', g.listing_id::text, 'application_ids', g.ids),
          'new_application:' || g.first_id::text, 'View the application');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_new_applications_batch skipped application % (%)', g.first_id, SQLSTATE;
    END;
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block applying.
  RAISE WARNING 'notify_new_applications_batch skipped (%)', SQLSTATE;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_new_applications_batch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_new_applications ON public.applications;
CREATE TRIGGER notify_new_applications
  AFTER INSERT ON public.applications
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.notify_new_applications_batch();

-- Withdrawals only. The withdraw branch is unchanged from Batch F1.
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

  IF TG_OP = 'UPDATE' AND NEW.status = 'withdrawn' AND OLD.status IS DISTINCT FROM 'withdrawn' THEN
    PERFORM public.notify_member(
      v_owner, 'application_withdrawn', 'Application withdrawn',
      v_nomad || ' withdrew their application for your sit in ' || v_city || COALESCE(', ' || v_dates, '') || '. Those dates are still open.',
      '/applications',
      jsonb_build_object('application_id', NEW.id::text, 'listing_id', NEW.listing_id::text),
      'application_withdrawn:' || NEW.id::text, 'View your applicants');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block withdrawing.
  RAISE WARNING 'notify_application_events skipped for application %', NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_application_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_application_events ON public.applications;
CREATE TRIGGER notify_application_events
  AFTER UPDATE OF status ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.notify_application_events();