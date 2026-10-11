-- Batch D2: notification choices, new-message notifications on the server,
-- message email digest, visibility and pause, membership and Stripe, roles
-- that follow the plan, founding code redemption, permissions tidy-up.
--
-- 1. notification_preferences: push_* columns and message_email_frequency
--    ('instant' | 'daily' | 'never'); own-row RLS; column grants.
--    notification_allowed(user, type, channel) is the one rule for every
--    push and email: per-type category, always-on types ignore the switches.
-- 2. push_on_notification_insert respects the push choice (keeps the
--    sit_update_loved and muted City Chat skips).
-- 3. new_message notifications are created by a trigger on messages (the
--    sender's browser no longer has to). No message text in the row, the
--    push or the email. Instant emails go through send-notification-email
--    from the server; daily ones through message-email-digest (pg_cron,
--    hourly, about 8am in the member's time zone). profiles.timezone.
-- 4. Visibility: a Nomad is public only when is_visible AND is_active, and
--    the two are kept equal. A paused Pet Parent (owner_profiles.is_active
--    false) has no public listings or public profile through them.
-- 5. Membership: Stripe ids, cancel-at-period-end, payment-failed date,
--    stripe_events for idempotent webhooks; members can't change any of
--    them (prevent_privilege_escalation).
-- 6. Roles follow the plan: user_roles.base_role is the member's onboarding
--    choice; role = base_role plus what the plan gives (Combined and
--    Founding: both). Members can no longer write user_roles directly; they
--    finish onboarding through complete_onboarding().
-- 7. Founding codes: redeemed only by the redeem-founding-code edge function
--    (service role), once per member, within the 1,000 cap.
-- 8. Permissions tidy-up for city_chat_mutes and city_chat_room_reads.
-- 9. Membership access: has_side_access(user, side) is the one rule for
--    applying, invitations, publishing and showing listings, and deciding.
--
-- Discoverability: a plan never makes anyone discoverable. Plans change
-- roles only; a side's profile is created when the member sets that side up
-- (its profile editor, or their first listing). Everyone's discoverability
-- before this migration is kept in d2_discoverability_before so the proof can
-- show what changed.

-- ─── 0. Discoverability before this migration (for the proof) ─────────────

CREATE TABLE IF NOT EXISTS public.d2_discoverability_before (
  user_id uuid PRIMARY KEY,
  discoverable boolean NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.d2_discoverability_before ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.d2_discoverability_before FROM PUBLIC, anon, authenticated;
INSERT INTO public.d2_discoverability_before (user_id, discoverable)
SELECT p.id, public.profile_is_discoverable(p.id) FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;


-- ─── 1. Notification choices ───────────────────────────────────────────────

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_membership boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_messages boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_applications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_sits boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_reviews boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_city_chat boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS message_email_frequency text NOT NULL DEFAULT 'instant',
  -- Server only: when the last daily message email went out.
  ADD COLUMN IF NOT EXISTS message_digest_sent_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_preferences_message_email_frequency_check') THEN
    ALTER TABLE public.notification_preferences
      ADD CONSTRAINT notification_preferences_message_email_frequency_check
      CHECK (message_email_frequency IN ('instant', 'daily', 'never'));
  END IF;
END;
$$;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notification_preferences TO authenticated;
GRANT INSERT (user_id, email_new_applications, email_messages, email_sit_updates, email_reviews,
              email_application_status, email_membership, push_messages, push_applications, push_sits,
              push_reviews, push_city_chat, message_email_frequency)
  ON public.notification_preferences TO authenticated;
GRANT UPDATE (user_id, email_new_applications, email_messages, email_sit_updates, email_reviews,
              email_application_status, email_membership, push_messages, push_applications, push_sits,
              push_reviews, push_city_chat, message_email_frequency)
  ON public.notification_preferences TO authenticated;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notification_preferences' LOOP
    EXECUTE format('DROP POLICY %I ON public.notification_preferences', p.policyname);
  END LOOP;
END;
$$;
CREATE POLICY "Members read their own notification choices" ON public.notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Members add their own notification choices" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members change their own notification choices" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Which row of the Notifications table a notification type belongs to.
-- 'always': safety alerts, ID checks, payment problems and changes to your
-- sits. 'other': not covered by a switch (sent).
CREATE OR REPLACE FUNCTION public.notification_category(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_type IN ('new_message', 'phone_shared') THEN 'messages'
    WHEN p_type IN ('new_application', 'application_status', 'application_withdrawn', 'invite') THEN 'applications'
    WHEN p_type IN ('sit_checkin', 'sit_checkin_reminder', 'sit_started', 'sit_update_loved', 'guide_unlocked',
                    'guide_nudge', 'guide_access_missing', 'arrival_vault_prompt', 'sit_story_ready',
                    'sit_story_ready_sitter', 'sit_story_portfolio_request') THEN 'sits'
    WHEN p_type IN ('review', 'review_reminder') THEN 'reviews'
    WHEN p_type = 'city_chat_thread_reply' THEN 'city_chat'
    WHEN p_type = 'membership' THEN 'membership'
    WHEN p_type IN ('sit_cancelled', 'sit_reschedule_proposed', 'sit_reschedule_accepted', 'sit_reschedule_declined',
                    'listing_dates_changed', 'listing_dates_removed', 'id_verification_status',
                    'id_verification_approved', 'id_verification_rejected', 'membership_payment_failed',
                    'reliability_strike', 'community_strike_heads_up_host', 'community_strike_heads_up_nomad',
                    'safety_alert') THEN 'always'
    ELSE 'other'
  END;
$$;

REVOKE ALL ON FUNCTION public.notification_category(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_category(text) TO authenticated, service_role;

-- The one rule for every push and email. A missing row means defaults
-- (everything on, message emails right away).
CREATE OR REPLACE FUNCTION public.notification_allowed(p_user_id uuid, p_type text, p_channel text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat text := public.notification_category(p_type);
  np public.notification_preferences%ROWTYPE;
BEGIN
  IF v_cat IN ('always', 'other') THEN
    RETURN true;
  END IF;
  -- City Chat replies are push only; Membership is email only.
  IF p_channel = 'email' AND v_cat = 'city_chat' THEN RETURN false; END IF;
  IF p_channel = 'push' AND v_cat = 'membership' THEN RETURN false; END IF;

  SELECT * INTO np FROM public.notification_preferences WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF p_channel = 'push' THEN
    RETURN CASE v_cat
      WHEN 'messages' THEN np.push_messages
      WHEN 'applications' THEN np.push_applications
      WHEN 'sits' THEN np.push_sits
      WHEN 'reviews' THEN np.push_reviews
      WHEN 'city_chat' THEN np.push_city_chat
      ELSE true
    END;
  END IF;

  -- Email.
  RETURN CASE v_cat
    WHEN 'messages' THEN np.email_messages AND np.message_email_frequency = 'instant'
    WHEN 'applications' THEN
      CASE WHEN p_type = 'new_application' THEN np.email_new_applications ELSE np.email_application_status END
    WHEN 'sits' THEN np.email_sit_updates
    WHEN 'reviews' THEN np.email_reviews
    WHEN 'membership' THEN np.email_membership
    ELSE true
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_allowed(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_allowed(uuid, text, text) TO service_role;


-- ─── 2. Push respects the choices ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  -- Quiet, in-app only notifications.
  IF NEW.type IN ('sit_update_loved') THEN
    RETURN NEW;
  END IF;

  -- City chat replies in a room the member muted.
  IF NEW.type = 'city_chat_thread_reply' AND EXISTS (
    SELECT 1 FROM public.city_chat_mutes mu
    WHERE mu.user_id = NEW.user_id AND mu.room_id::text = NEW.data->>'room_id'
  ) THEN
    RETURN NEW;
  END IF;

  -- The member's push choice for this kind of notification (always-on
  -- types ignore it).
  IF NOT public.notification_allowed(NEW.user_id, NEW.type, 'push') THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_trigger_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'internal_trigger_secret missing from vault; push skipped';
    RETURN NEW;
  END IF;

  -- pg_net queues the request and sends it after this transaction commits,
  -- so the function always finds the committed row.
  PERFORM net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body    := jsonb_build_object('notification_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to queue push for notification %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.push_on_notification_insert() FROM PUBLIC, anon, authenticated;


-- ─── 3. New-message notifications on the server ────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text;
-- Others never read it.
REVOKE SELECT (timezone) ON public.profiles FROM anon, authenticated;

-- Saved from the browser at sign-in. Only real IANA names.
CREATE OR REPLACE FUNCTION public.set_my_timezone(p_timezone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RETURN;
  END IF;
  UPDATE public.profiles SET timezone = p_timezone
  WHERE id = auth.uid() AND timezone IS DISTINCT FROM p_timezone;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_timezone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_timezone(text) TO authenticated;

-- One in-app row per message, for the other member only. It names the
-- sender and the listing, never the message text. Phone-share markers,
-- daily-update cards and Ask the Nest questions already notify on their own.
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  v_recipient uuid;
  v_sender text;
  v_title text;
  v_listing text;
  v_body text := btrim(COALESCE(NEW.body, ''));
BEGIN
  IF NEW.sender_user_id IS NULL
     OR NEW.guide_question_id IS NOT NULL
     OR left(v_body, 15) = '[[phone_share]]'
     OR left(v_body, 11) = '[[checkin]]' THEN
    RETURN NULL;
  END IF;

  SELECT cv.owner_user_id, cv.sitter_user_id, l.title INTO c
  FROM public.conversations cv
  LEFT JOIN public.listings l ON l.id = cv.listing_id
  WHERE cv.id = NEW.conversation_id;
  IF c.owner_user_id IS NULL OR c.sitter_user_id IS NULL THEN
    RETURN NULL; -- a former member's chat
  END IF;
  v_recipient := CASE WHEN c.owner_user_id = NEW.sender_user_id THEN c.sitter_user_id ELSE c.owner_user_id END;
  IF v_recipient IS NULL OR v_recipient = NEW.sender_user_id THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(NULLIF(btrim(first_name), ''), 'A member') INTO v_sender FROM public.profiles WHERE id = NEW.sender_user_id;
  v_sender := COALESCE(v_sender, 'A member');
  v_listing := NULLIF(btrim(c.title), '');
  v_title := 'New message from ' || v_sender || COALESCE(' about ' || v_listing, '');

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    v_recipient,
    'new_message',
    v_title,
    'Open your chat to read it.',
    jsonb_build_object(
      'conversation_id', NEW.conversation_id::text,
      'message_id', NEW.id::text,
      'url', '/inbox?conversation=' || NEW.conversation_id::text
    )
  );

  -- Instant email (the member's choice; daily ones go in the digest).
  IF public.notification_allowed(v_recipient, 'new_message', 'email') THEN
    PERFORM public.request_internal_function('send-notification-email', jsonb_build_object(
      'type', 'new_message',
      'recipientUserId', v_recipient::text,
      'skipInAppNotification', true,
      'data', jsonb_build_object(
        'senderName', v_sender,
        'listingTitle', COALESCE(v_listing, ''),
        'conversationId', NEW.conversation_id::text,
        'conversation_id', NEW.conversation_id::text
      )
    ));
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block or fail sending a message.
  RAISE WARNING 'notify_new_message skipped for message %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_new_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_new_message ON public.messages;
CREATE TRIGGER notify_new_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

-- Members on "Once a day" whose morning (about 8am, their time zone, London
-- if unknown) has come and who haven't had a digest in the last 20 hours,
-- with their unread messages since the last digest (at most a day back).
-- p_force skips the time-of-day check (tests and manual runs only).
CREATE OR REPLACE FUNCTION public.message_digest_due(p_force boolean DEFAULT false)
RETURNS TABLE (user_id uuid, message_count integer, sender_names text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT np.user_id,
         count(m.id)::integer,
         array_agg(DISTINCT COALESCE(NULLIF(btrim(sp.first_name), ''), 'A member'))
  FROM public.notification_preferences np
  JOIN public.profiles p ON p.id = np.user_id
  JOIN public.conversations c ON (c.owner_user_id = np.user_id OR c.sitter_user_id = np.user_id)
  JOIN public.messages m ON m.conversation_id = c.id
  LEFT JOIN public.profiles sp ON sp.id = m.sender_user_id
  WHERE np.message_email_frequency = 'daily'
    AND np.email_messages
    AND (p_force OR EXTRACT(hour FROM now() AT TIME ZONE COALESCE(
          (SELECT tz.name FROM pg_timezone_names tz WHERE tz.name = p.timezone), 'Europe/London')) = 8)
    AND (np.message_digest_sent_at IS NULL OR np.message_digest_sent_at < now() - interval '20 hours')
    AND m.sender_user_id IS NOT NULL
    AND m.sender_user_id <> np.user_id
    AND m.read_at IS NULL
    AND m.guide_question_id IS NULL
    AND left(btrim(m.body), 15) <> '[[phone_share]]'
    AND left(btrim(m.body), 11) <> '[[checkin]]'
    AND m.created_at > GREATEST(COALESCE(np.message_digest_sent_at, now() - interval '24 hours'), now() - interval '24 hours')
  GROUP BY np.user_id;
$$;

REVOKE ALL ON FUNCTION public.message_digest_due(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.message_digest_due(boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_message_digest_sent(p_user_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.notification_preferences SET message_digest_sent_at = now()
  WHERE user_id = ANY (COALESCE(p_user_ids, '{}'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_message_digest_sent(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_message_digest_sent(uuid[]) TO service_role;

-- Hourly; the function sends only to members whose 8am it is.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'message-email-digest';
  PERFORM cron.schedule('message-email-digest', '5 * * * *', $cron$SELECT public.request_internal_function('message-email-digest');$cron$);
END;
$$;


-- ─── 4. Visibility and pause ───────────────────────────────────────────────

-- "Show my Nomad profile" is one switch: is_visible and is_active move
-- together, whichever one a screen writes.
CREATE OR REPLACE FUNCTION public.sync_sitter_visibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.is_active := COALESCE(NEW.is_active, true) AND COALESCE(NEW.is_visible, true);
    NEW.is_visible := NEW.is_active;
  ELSIF NEW.is_visible IS DISTINCT FROM OLD.is_visible THEN
    NEW.is_active := NEW.is_visible;
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.is_visible := NEW.is_active;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_sitter_visibility() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_sitter_visibility ON public.sitter_profiles;
CREATE TRIGGER sync_sitter_visibility
BEFORE INSERT OR UPDATE OF is_visible, is_active ON public.sitter_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_sitter_visibility();

-- Line up rows that are out of step today: hidden if either says hidden.
UPDATE public.sitter_profiles
SET is_visible = false, is_active = false
WHERE (is_visible IS NOT TRUE OR is_active IS NOT TRUE)
  AND (is_visible IS DISTINCT FROM is_active OR is_visible IS NULL OR is_active IS NULL);

-- Discoverable members: a Nomad only when visible and active; a Pet Parent
-- only while not paused (a paused owner's listings don't count either).
CREATE OR REPLACE FUNCTION public.profile_is_discoverable(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.sitter_profiles sp
                 WHERE sp.user_id = p_user_id AND sp.is_visible IS TRUE AND sp.is_active IS TRUE)
      OR EXISTS (SELECT 1 FROM public.owner_profiles op WHERE op.user_id = p_user_id AND op.is_active IS TRUE)
      OR EXISTS (SELECT 1 FROM public.listings l
                 WHERE l.owner_user_id = p_user_id AND l.status = 'published' AND public.is_owner_active(p_user_id))
      OR EXISTS (SELECT 1 FROM public.sits s WHERE s.owner_user_id = p_user_id OR s.sitter_user_id = p_user_id);
$function$;

-- Listings of a paused Pet Parent: hidden from everyone but the owner (as
-- before), and now also their pets. Confirmed sits read through their own
-- functions and snapshots, so they are not affected.
DROP POLICY IF EXISTS "Anyone can view pets of published listings" ON public.pets;
CREATE POLICY "Anyone can view pets of published listings"
ON public.pets
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.listings
    WHERE listings.id = pets.listing_id
      AND listings.status = 'published'::listing_status
      AND public.is_owner_active(listings.owner_user_id)
  )
);


-- A member's first listing sets up their Pet Parent side: the owner
-- profile it needs is created then (by the member's own action, not a plan).
CREATE OR REPLACE FUNCTION public.ensure_owner_profile_for_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.owner_profiles (user_id) VALUES (NEW.owner_user_id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ensure_owner_profile_for_listing skipped for listing %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_owner_profile_for_listing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ensure_owner_profile_for_listing ON public.listings;
CREATE TRIGGER ensure_owner_profile_for_listing
AFTER INSERT ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.ensure_owner_profile_for_listing();


-- ─── 5. Membership columns (server only) ───────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS membership_cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS membership_payment_failed_at timestamptz;

REVOKE SELECT (stripe_customer_id, stripe_subscription_id, membership_cancel_at_period_end, membership_payment_failed_at)
  ON public.profiles FROM anon, authenticated;

-- Each Stripe event is handled once.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_events FROM PUBLIC, anon, authenticated;

-- Members can never change their own membership, Stripe ids, roles or
-- founding status (adds the new columns to the existing guard).
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Admin flag changes are always blocked unless the caller is a confirmed admin,
  -- regardless of request path (end-user, RPC, or otherwise).
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
     ) THEN
    RAISE EXCEPTION 'Insufficient privileges to modify admin status';
  END IF;

  IF NOT public.request_is_end_user() THEN
    RETURN NEW;
  END IF;

  -- Trusted SECURITY DEFINER routines set this flag for the duration of
  -- their transaction only.
  IF coalesce(current_setting('app.trusted_membership_update', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = NEW.id THEN
    IF NEW.founding_member IS DISTINCT FROM OLD.founding_member THEN RAISE EXCEPTION 'Insufficient privileges to modify founding member status'; END IF;
    IF NEW.membership_status IS DISTINCT FROM OLD.membership_status THEN RAISE EXCEPTION 'Insufficient privileges to modify membership status'; END IF;
    IF NEW.membership_type IS DISTINCT FROM OLD.membership_type THEN RAISE EXCEPTION 'Insufficient privileges to modify membership type'; END IF;
    IF NEW.membership_expiry IS DISTINCT FROM OLD.membership_expiry THEN RAISE EXCEPTION 'Insufficient privileges to modify membership expiry'; END IF;
    IF NEW.membership_cancel_at_period_end IS DISTINCT FROM OLD.membership_cancel_at_period_end THEN RAISE EXCEPTION 'Insufficient privileges to modify membership'; END IF;
    IF NEW.membership_payment_failed_at IS DISTINCT FROM OLD.membership_payment_failed_at THEN RAISE EXCEPTION 'Insufficient privileges to modify membership'; END IF;
    IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN RAISE EXCEPTION 'Insufficient privileges to modify billing'; END IF;
    IF NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN RAISE EXCEPTION 'Insufficient privileges to modify billing'; END IF;
    IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN RAISE EXCEPTION 'Insufficient privileges to modify email verified status'; END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN RAISE EXCEPTION 'Insufficient privileges to modify phone verified status'; END IF;
    IF NEW.id_verified IS DISTINCT FROM OLD.id_verified THEN RAISE EXCEPTION 'Insufficient privileges to modify id verified status'; END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_privilege_escalation() FROM PUBLIC, anon, authenticated;

-- The member's own membership, for the Membership page and Settings.
DROP FUNCTION IF EXISTS public.get_my_membership();
CREATE OR REPLACE FUNCTION public.get_my_membership()
RETURNS TABLE (
  founding_member boolean,
  membership_status text,
  membership_type text,
  membership_expiry timestamptz,
  cancel_at_period_end boolean,
  payment_failed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.founding_member, p.membership_status, p.membership_type, p.membership_expiry,
         p.membership_cancel_at_period_end, p.membership_payment_failed_at
  FROM public.profiles p
  WHERE p.id = auth.uid() AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_membership() TO authenticated;


-- ─── 6. Roles follow the plan ──────────────────────────────────────────────

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS base_role public.app_role;
UPDATE public.user_roles SET base_role = role WHERE base_role IS NULL;

-- base_role plus what the plan gives. Combined and Founding: both. A paid
-- Nomad or Pet Parent plan adds that side. Lapsed plans give nothing extra.
CREATE OR REPLACE FUNCTION public.role_for(p_base public.app_role, p_type text, p_status text, p_founding boolean)
RETURNS public.app_role
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_founding IS TRUE THEN 'both'::public.app_role
    WHEN p_status IN ('active', 'trialing', 'past_due') AND p_type = 'combined' THEN 'both'::public.app_role
    WHEN p_status IN ('active', 'trialing', 'past_due') AND p_type = 'sitter' THEN
      CASE WHEN p_base IN ('owner', 'both') THEN 'both'::public.app_role ELSE 'sitter'::public.app_role END
    WHEN p_status IN ('active', 'trialing', 'past_due') AND p_type = 'owner' THEN
      CASE WHEN p_base IN ('sitter', 'both') THEN 'both'::public.app_role ELSE 'owner'::public.app_role END
    ELSE COALESCE(p_base, 'sitter'::public.app_role)
  END;
$$;

REVOKE ALL ON FUNCTION public.role_for(public.app_role, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.role_for(public.app_role, text, text, boolean) TO authenticated, service_role;

-- Recompute a member's role from their base role and plan.
CREATE OR REPLACE FUNCTION public.refresh_member_role(p_user_id uuid)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  r record;
  v_role public.app_role;
BEGIN
  SELECT membership_type, membership_status, founding_member INTO p FROM public.profiles WHERE id = p_user_id;
  SELECT role, base_role INTO r FROM public.user_roles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL; -- onboarding not finished yet
  END IF;
  v_role := public.role_for(COALESCE(r.base_role, r.role), p.membership_type, p.membership_status, p.founding_member);
  IF v_role IS DISTINCT FROM r.role THEN
    PERFORM set_config('app.trusted_role_update', 'on', true);
    UPDATE public.user_roles SET role = v_role WHERE user_id = p_user_id;
    PERFORM set_config('app.trusted_role_update', 'off', true);
  END IF;
  -- Roles only. A plan never creates a Nomad or Pet Parent profile, so it
  -- can never make anyone discoverable: the member sets a side up themselves
  -- (its profile editor, or their first listing).
  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_member_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_member_role(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.roles_follow_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_member_role(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.roles_follow_plan() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS roles_follow_plan ON public.profiles;
CREATE TRIGGER roles_follow_plan
AFTER UPDATE OF membership_type, membership_status, founding_member ON public.profiles
FOR EACH ROW
WHEN (NEW.membership_type IS DISTINCT FROM OLD.membership_type
   OR NEW.membership_status IS DISTINCT FROM OLD.membership_status
   OR NEW.founding_member IS DISTINCT FROM OLD.founding_member)
EXECUTE FUNCTION public.roles_follow_plan();

-- Members can't write user_roles at all now; onboarding goes through
-- complete_onboarding(). A guard also refuses any end-user role change.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.request_is_end_user()
     AND coalesce(current_setting('app.trusted_role_update', true), '') <> 'on'
     AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role OR NEW.base_role IS DISTINCT FROM OLD.base_role) THEN
    RAISE EXCEPTION 'Roles follow your membership' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_user_roles() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_user_roles ON public.user_roles;
CREATE TRIGGER guard_user_roles
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_user_roles();

-- Onboarding: the member picks how they'll use NomadNest (their base role)
-- once. After that, their role follows the plan.
CREATE OR REPLACE FUNCTION public.complete_onboarding(p_role public.app_role)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_done boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT onboarding_completed INTO v_done FROM public.user_roles WHERE user_id = v_uid;
  IF v_done IS TRUE THEN
    -- Already set up: just bring the role in line with the plan.
    RETURN public.refresh_member_role(v_uid);
  END IF;
  PERFORM set_config('app.trusted_role_update', 'on', true);
  INSERT INTO public.user_roles (user_id, role, base_role, onboarding_completed)
  VALUES (v_uid, p_role, p_role, true)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, base_role = EXCLUDED.base_role, onboarding_completed = true;
  PERFORM set_config('app.trusted_role_update', 'off', true);
  RETURN public.refresh_member_role(v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(public.app_role) TO authenticated;

-- Bring everyone in line once.
DO $$
DECLARE
  u record;
BEGIN
  FOR u IN SELECT user_id FROM public.user_roles LOOP
    PERFORM public.refresh_member_role(u.user_id);
  END LOOP;
END;
$$;


-- ─── 7. Founding codes: server only, once per member, 1,000 cap ────────────

CREATE TABLE IF NOT EXISTS public.founding_redemptions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_id uuid REFERENCES public.founding_member_codes(id) ON DELETE SET NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.founding_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.founding_redemptions FROM PUBLIC, anon, authenticated;

-- Members no longer redeem directly: the redeem-founding-code function
-- cancels and refunds a paid plan first.
REVOKE ALL ON FUNCTION public.redeem_founding_member_code(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.redeem_founding_code_for(p_user_id uuid, p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.founding_member_codes%ROWTYPE;
  v_members integer;
BEGIN
  IF p_user_id IS NULL OR NULLIF(btrim(p_code), '') IS NULL THEN
    RETURN 'invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM public.founding_redemptions WHERE user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND founding_member IS TRUE) THEN
    RETURN 'already';
  END IF;

  SELECT * INTO v_row FROM public.founding_member_codes
  WHERE code = btrim(p_code) AND active = true
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF v_row.used_count >= v_row.max_uses THEN RETURN 'exhausted'; END IF;

  -- The 1,000 founding places, counted under a lock so two people can't
  -- take the last one.
  PERFORM pg_advisory_xact_lock(hashtext('founding_cap'));
  SELECT count(*) INTO v_members FROM public.profiles WHERE founding_member IS TRUE;
  IF v_members >= 1000 THEN RETURN 'exhausted'; END IF;

  UPDATE public.founding_member_codes SET used_count = used_count + 1 WHERE id = v_row.id;
  INSERT INTO public.founding_redemptions (user_id, code_id) VALUES (p_user_id, v_row.id);

  PERFORM set_config('app.trusted_membership_update', 'on', true);
  UPDATE public.profiles
  SET founding_member = true, membership_status = 'active', membership_type = 'combined',
      membership_expiry = (now() + INTERVAL '100 years'),
      membership_cancel_at_period_end = false, membership_payment_failed_at = NULL
  WHERE id = p_user_id;
  PERFORM set_config('app.trusted_membership_update', 'off', true);

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_founding_code_for(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_founding_code_for(uuid, text) TO service_role;

-- Spots left: the 1,000 cap, and never more than the active codes allow.
CREATE OR REPLACE FUNCTION public.public_founding_spots()
RETURNS TABLE (spots_left integer, cap integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    SELECT LEAST(1000, COALESCE(SUM(max_uses), 0))::integer AS cap
    FROM public.founding_member_codes
    WHERE active
  ), m AS (
    SELECT count(*)::integer AS members FROM public.profiles WHERE founding_member IS TRUE
  )
  SELECT GREATEST(LEAST(c.cap - m.members, 1000 - m.members), 0)::integer AS spots_left, 1000 AS cap
  FROM c, m;
$$;

REVOKE ALL ON FUNCTION public.public_founding_spots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_founding_spots() TO anon, authenticated, service_role;


-- ─── 8. Permissions tidy-up ────────────────────────────────────────────────

REVOKE ALL ON public.city_chat_mutes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.city_chat_mutes TO authenticated;
REVOKE ALL ON public.city_chat_room_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.city_chat_room_reads TO authenticated;


-- ─── 9. Membership access: one rule, used everywhere ───────────────────────
--
-- A member has a side only while they have a membership for it:
--   Nomad side (apply, accept invitations): Founding, or Nomad or Combined.
--   Pet Parent side (publish and show listings, send invitations, accept or
--   shortlist applicants): Founding, or Pet Parent or Combined.
-- "Has a membership": Founding, or status 'active', or 'past_due' while Stripe
-- is still retrying (at most 8 days after the first failed payment, even if no
-- webhook arrives), and the expiry date hasn't passed.
-- Confirmed and in-progress sits are never affected: chats, the Welcome
-- Guide, check-ins, daily updates and reviews don't read this rule.
-- Pending applications and invitations of a member without access are
-- paused (hidden from the other member, can't be answered), never deleted;
-- they come back when the member pays again. No notification is sent.

CREATE OR REPLACE FUNCTION public.has_side_access(p_user_id uuid, p_side text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.founding_member IS TRUE
        OR (
          (p.membership_status = 'active'
           OR (p.membership_status = 'past_due'
               AND (p.membership_payment_failed_at IS NULL OR p.membership_payment_failed_at > now() - interval '8 days')))
          AND (p.membership_expiry IS NULL OR p.membership_expiry > now())
          AND (p.membership_type = 'combined' OR p.membership_type = p_side)
        )
    FROM public.profiles p
    WHERE p.id = p_user_id AND p_side IN ('sitter', 'owner')
  ), false);
$$;

-- Membership is private: nobody can ask about another member. Server code
-- (service role) and the SECURITY DEFINER wrappers below call it; policies
-- use only the row-keyed wrappers.
REVOKE ALL ON FUNCTION public.has_side_access(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_side_access(uuid, text) TO service_role;

-- The signed-in member's own access, for the screens.
CREATE OR REPLACE FUNCTION public.get_my_side_access()
RETURNS TABLE (sitter boolean, owner boolean, past_due boolean, retry_until timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_side_access(p.id, 'sitter'),
         public.has_side_access(p.id, 'owner'),
         p.founding_member IS NOT TRUE AND p.membership_status = 'past_due',
         CASE WHEN p.founding_member IS NOT TRUE AND p.membership_status = 'past_due'
              THEN COALESCE(p.membership_payment_failed_at, now()) + interval '7 days' END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_side_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_side_access() TO authenticated;

-- A listing's owner has Pet Parent access (helper for policies, so they don't
-- read listings through RLS).
CREATE OR REPLACE FUNCTION public.listing_owner_has_access(p_listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT public.has_side_access(l.owner_user_id, 'owner') FROM public.listings l WHERE l.id = p_listing_id), false);
$$;

REVOKE ALL ON FUNCTION public.listing_owner_has_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listing_owner_has_access(uuid) TO service_role;

-- Policy helpers. Each answers only about a row the viewer is already
-- looking at (or about the viewer), so they reveal nothing new.

-- A listing anyone may see: published, owner not paused, owner has Pet Parent
-- access.
CREATE OR REPLACE FUNCTION public.listing_is_live(p_listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT l.status = 'published'::listing_status
       AND public.is_owner_active(l.owner_user_id)
       AND public.has_side_access(l.owner_user_id, 'owner')
    FROM public.listings l WHERE l.id = p_listing_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.listing_is_live(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_is_live(uuid) TO anon, authenticated, service_role;

-- An application that isn't paused: decided ones always, pending ones only
-- while both members have their side.
CREATE OR REPLACE FUNCTION public.application_is_live(p_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT a.status NOT IN ('applied', 'shortlisted')
        OR (public.has_side_access(a.sitter_user_id, 'sitter') AND public.has_side_access(l.owner_user_id, 'owner'))
    FROM public.applications a JOIN public.listings l ON l.id = a.listing_id
    WHERE a.id = p_application_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.application_is_live(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_is_live(uuid) TO authenticated, service_role;

-- The same for an invitation.
CREATE OR REPLACE FUNCTION public.invitation_is_live(p_invite_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT i.status NOT IN ('pending', 'viewed')
        OR (public.has_side_access(i.sitter_user_id, 'sitter') AND public.has_side_access(i.owner_user_id, 'owner'))
    FROM public.sitter_invites i WHERE i.id = p_invite_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.invitation_is_live(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitation_is_live(uuid) TO authenticated, service_role;

-- The signed-in member's own side only.
CREATE OR REPLACE FUNCTION public.i_have_side_access(p_side text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_side_access(auth.uid(), p_side);
$$;

REVOKE ALL ON FUNCTION public.i_have_side_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_have_side_access(text) TO authenticated, service_role;

-- Publishing: the same rule (past_due during the retry week keeps access).
CREATE OR REPLACE FUNCTION public.can_publish_listing()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    COALESCE(public.is_admin_user(auth.uid()), false)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.id_verified IS TRUE
        AND public.has_side_access(p.id, 'owner')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_publish_listing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_publish_listing() TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_listing_publish_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published') THEN
    IF NOT public.can_publish_listing() THEN
      RAISE EXCEPTION 'To publish a listing you need a Pet Parent or Combined membership and a verified ID.'
        USING ERRCODE = '42501', HINT = 'membership_needed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Listings (and their pets) are public only while the owner is active
-- (not paused) and has Pet Parent access. They come back by themselves when
-- the member pays again. The owner always sees their own.
DROP POLICY IF EXISTS "Anyone can view published listings from active owners" ON public.listings;
CREATE POLICY "Anyone can view published listings from active owners"
ON public.listings
FOR SELECT
TO anon, authenticated
USING (
  public.listing_is_live(id)
  OR auth.uid() = owner_user_id
);

DROP POLICY IF EXISTS "Anyone can view pets of published listings" ON public.pets;
CREATE POLICY "Anyone can view pets of published listings"
ON public.pets
FOR SELECT
TO anon, authenticated
USING (public.listing_is_live(listing_id));

-- Applying needs Nomad access (also through accept_invite, which inserts as
-- the Nomad). A plain message first, then the policy as the backstop.
CREATE OR REPLACE FUNCTION public.require_nomad_access_to_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.request_is_end_user() AND NOT public.has_side_access(NEW.sitter_user_id, 'sitter') THEN
    RAISE EXCEPTION 'You need a Nomad membership to apply.'
      USING ERRCODE = '42501', HINT = 'membership_needed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_nomad_access_to_apply() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS require_nomad_access_to_apply ON public.applications;
CREATE TRIGGER require_nomad_access_to_apply
BEFORE INSERT ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.require_nomad_access_to_apply();

DROP POLICY IF EXISTS "Sitters can insert applications" ON public.applications;
CREATE POLICY "Sitters can insert applications"
ON public.applications
FOR INSERT
TO authenticated
WITH CHECK (
  sitter_user_id = auth.uid()
  AND status = 'applied'::public.application_status
  AND public.i_have_side_access('sitter')
  -- The date range must belong to the listing being applied to.
  AND EXISTS (
    SELECT 1 FROM public.sit_dates sd
    WHERE sd.id = applications.sit_dates_id
      AND sd.listing_id = applications.listing_id
  )
  -- The listing must be published and not the applicant's own.
  AND EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = applications.listing_id
      AND l.status = 'published'::public.listing_status
      AND l.owner_user_id <> auth.uid()
  )
);

-- Pending applications are paused (hidden from the other member) while
-- either side has no access. Decided ones (accepted, declined, …) and the
-- sits they led to are never hidden.
DROP POLICY IF EXISTS "Sitters can view own applications" ON public.applications;
CREATE POLICY "Sitters can view own applications"
ON public.applications FOR SELECT TO authenticated
USING (
  sitter_user_id = auth.uid()
  AND public.application_is_live(id)
);

DROP POLICY IF EXISTS "Owners can view applications for their listings" ON public.applications;
CREATE POLICY "Owners can view applications for their listings"
ON public.applications FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_user_id = auth.uid())
  AND public.application_is_live(id)
);

-- Shortlisting or accepting (any path, including accept_application and
-- shortlist_application) needs both members to have their side.
CREATE OR REPLACE FUNCTION public.require_access_to_decide()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('applied', 'shortlisted') AND NEW.status IN ('shortlisted', 'accepted')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.listing_owner_has_access(NEW.listing_id) THEN
      RAISE EXCEPTION 'You need a Pet Parent membership to accept or shortlist Nomads.'
        USING ERRCODE = '42501', HINT = 'membership_needed';
    END IF;
    IF NOT public.has_side_access(NEW.sitter_user_id, 'sitter') THEN
      RAISE EXCEPTION 'This application is paused because the Nomad''s membership has ended.'
        USING ERRCODE = '42501', HINT = 'application_paused';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_access_to_decide() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS require_access_to_decide ON public.applications;
CREATE TRIGGER require_access_to_decide
BEFORE UPDATE OF status ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.require_access_to_decide();

-- Invitations: sending needs Pet Parent access; pending ones are paused while
-- either side has no access; answering needs both.
CREATE OR REPLACE FUNCTION public.require_owner_access_to_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.request_is_end_user() AND NOT public.has_side_access(NEW.owner_user_id, 'owner') THEN
    RAISE EXCEPTION 'You need a Pet Parent membership to invite Nomads.'
      USING ERRCODE = '42501', HINT = 'membership_needed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_owner_access_to_invite() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS require_owner_access_to_invite ON public.sitter_invites;
CREATE TRIGGER require_owner_access_to_invite
BEFORE INSERT ON public.sitter_invites
FOR EACH ROW EXECUTE FUNCTION public.require_owner_access_to_invite();

DROP POLICY IF EXISTS "Owners can insert invites" ON public.sitter_invites;
CREATE POLICY "Owners can insert invites"
ON public.sitter_invites FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = owner_user_id
  AND sitter_user_id <> auth.uid()
  AND status = 'pending'
  AND public.i_have_side_access('owner')
  AND EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = sitter_invites.listing_id AND l.owner_user_id = auth.uid() AND l.status = 'published'
  )
  AND EXISTS (
    SELECT 1 FROM public.sit_dates sd
    WHERE sd.id = sitter_invites.sit_dates_id AND sd.listing_id = sitter_invites.listing_id
      AND sd.status = 'open' AND sd.end_date >= current_date
  )
);

DROP POLICY IF EXISTS "Owners can view sent invites" ON public.sitter_invites;
CREATE POLICY "Owners can view sent invites"
ON public.sitter_invites FOR SELECT TO authenticated
USING (
  auth.uid() = owner_user_id
  AND public.invitation_is_live(id)
);

DROP POLICY IF EXISTS "Sitters can view received invites" ON public.sitter_invites;
CREATE POLICY "Sitters can view received invites"
ON public.sitter_invites FOR SELECT TO authenticated
USING (
  auth.uid() = sitter_user_id
  AND public.invitation_is_live(id)
);

-- The Nomad answering an invitation (accept, decline, mark viewed).
CREATE OR REPLACE FUNCTION public.require_access_to_answer_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND auth.uid() IS NOT NULL AND auth.uid() = NEW.sitter_user_id THEN
    IF NOT public.has_side_access(NEW.sitter_user_id, 'sitter') THEN
      RAISE EXCEPTION 'You need a Nomad membership to answer invitations.'
        USING ERRCODE = '42501', HINT = 'membership_needed';
    END IF;
    IF NOT public.has_side_access(NEW.owner_user_id, 'owner') THEN
      RAISE EXCEPTION 'This invitation is paused for now.'
        USING ERRCODE = '42501', HINT = 'invite_paused';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_access_to_answer_invite() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS require_access_to_answer_invite ON public.sitter_invites;
CREATE TRIGGER require_access_to_answer_invite
BEFORE UPDATE OF status ON public.sitter_invites
FOR EACH ROW EXECUTE FUNCTION public.require_access_to_answer_invite();

-- is_owner_active can't be asked about any member either. Only listing_is_live
-- and server code use it now; refuse to go on if another policy still does.
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND COALESCE(qual, '') || COALESCE(with_check, '') ~ 'is_owner_active|has_side_access';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Policies still call is_owner_active or has_side_access directly: %', v_bad;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_owner_active(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_active(uuid) TO service_role;

-- The Pet Parent's applicants list hides paused applications too
-- (re-stated from 20261004090000_batch_c_fixes with one extra condition).
DROP FUNCTION IF EXISTS public.get_listing_applicants(uuid);

CREATE OR REPLACE FUNCTION public.get_listing_applicants(p_listing_id uuid)
RETURNS TABLE (
  application_id uuid,
  sit_dates_id uuid,
  start_date date,
  end_date date,
  status public.application_status,
  created_at timestamptz,
  owner_seen boolean,
  message text,
  who_applying text,
  highlights text[],
  sitter_user_id uuid,
  first_name text,
  avatar_url text,
  city text,
  country text,
  founding_member boolean,
  id_verified boolean,
  pet_types text[],
  review_count integer,
  avg_rating numeric,
  review_rate integer,
  fit_total_nights integer,
  fit_free_nights integer,
  fit_free_from date,
  fit_free_to date,
  fit_pets_known text[],
  fit_pets_missing text[],
  fit_meds_ok boolean,
  fit_same_city boolean,
  sit_id uuid,
  sit_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_city text;
  v_pet_types text[];
  v_meds boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '28000';
  END IF;

  SELECT l.owner_user_id, NULLIF(lower(btrim(l.city)), '') INTO v_owner, v_city
  FROM public.listings l WHERE l.id = p_listing_id;
  IF NOT FOUND OR v_owner <> v_uid THEN
    RAISE EXCEPTION 'Listing not found.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT public.canonical_pet_type(pt.type)) FILTER (
           WHERE public.canonical_pet_type(pt.type) NOT IN ('', 'other')), ARRAY[]::text[]),
         COALESCE(bool_or(pt.requires_medication IS TRUE OR pt.has_medication IS TRUE), false)
    INTO v_pet_types, v_meds
  FROM public.pets pt WHERE pt.listing_id = p_listing_id;

  RETURN QUERY
  WITH apps AS (
    SELECT a.*, sd.start_date AS sd_start, sd.end_date AS sd_end
    FROM public.applications a
    JOIN public.sit_dates sd ON sd.id = a.sit_dates_id
    WHERE a.listing_id = p_listing_id
      -- Paused: a pending application from a Nomad without Nomad access is
      -- hidden until they have a membership again.
      AND (a.status NOT IN ('applied', 'shortlisted') OR public.has_side_access(a.sitter_user_id, 'sitter'))
  ),
  nomads AS (
    SELECT DISTINCT apps.sitter_user_id AS uid FROM apps
  ),
  rates AS (
    SELECT r.user_id, r.review_rate
    FROM public.member_review_rates(ARRAY(SELECT uid FROM nomads)) r
  ),
  revs AS (
    SELECT rv.reviewee_user_id AS uid, COUNT(*)::integer AS n, ROUND(AVG(rv.rating)::numeric, 2) AS avg
    FROM public.reviews rv
    WHERE rv.reviewee_user_id IN (SELECT uid FROM nomads)
    GROUP BY rv.reviewee_user_id
  ),
  -- Nights of each application's range the Nomad has marked free (and isn't
  -- booked elsewhere), only for Nomads who keep a calendar at all.
  nights AS (
    SELECT apps.id AS app_id, d::date AS night,
           EXISTS (
             SELECT 1 FROM public.sitter_availability av
             WHERE av.sitter_user_id = apps.sitter_user_id
               AND d::date BETWEEN av.start_date AND av.end_date
           )
           AND NOT EXISTS (
             SELECT 1 FROM public.sits s
             LEFT JOIN public.sit_dates bsd ON bsd.id = s.sit_dates_id
             WHERE s.sitter_user_id = apps.sitter_user_id
               AND s.status IN ('confirmed', 'in_progress')
               AND s.listing_id IS DISTINCT FROM p_listing_id
               AND d::date BETWEEN COALESCE(bsd.start_date, s.snapshot_start_date)
                               AND COALESCE(bsd.end_date, s.snapshot_end_date)
           ) AS free
    FROM apps
    CROSS JOIN LATERAL generate_series(apps.sd_start, GREATEST(apps.sd_end - 1, apps.sd_start), interval '1 day') d
    WHERE EXISTS (SELECT 1 FROM public.sitter_availability av2 WHERE av2.sitter_user_id = apps.sitter_user_id)
  ),
  fit AS (
    SELECT app_id,
           COUNT(*)::integer AS total,
           COUNT(*) FILTER (WHERE free)::integer AS free_n,
           MIN(night) FILTER (WHERE free) AS free_from,
           MAX(night) FILTER (WHERE free) AS free_to
    FROM nights GROUP BY app_id
  )
  SELECT
    apps.id,
    apps.sit_dates_id,
    apps.sd_start,
    apps.sd_end,
    apps.status,
    apps.created_at,
    (apps.owner_seen_at IS NOT NULL),
    apps.message,
    apps.who_applying,
    apps.highlights,
    apps.sitter_user_id,
    NULLIF(btrim(p.first_name), ''),
    p.avatar_url,
    p.city,
    p.country,
    COALESCE(p.founding_member, false),
    -- The real result of the ID check, not the sitter_profiles copy.
    COALESCE(p.id_verified, false),
    COALESCE(sp.pet_types, ARRAY[]::text[]),
    COALESCE(revs.n, 0),
    revs.avg,
    rates.review_rate,
    GREATEST(apps.sd_end - apps.sd_start, 1)::integer,
    fit.free_n,
    fit.free_from,
    CASE WHEN fit.free_to IS NULL THEN NULL ELSE fit.free_to + 1 END,
    ARRAY(
      SELECT t FROM unnest(v_pet_types) t
      WHERE t = ANY (ARRAY(SELECT public.canonical_pet_type(x) FROM unnest(COALESCE(sp.pet_types, ARRAY[]::text[])) x))
    ),
    ARRAY(
      SELECT t FROM unnest(v_pet_types) t
      WHERE NOT (t = ANY (ARRAY(SELECT public.canonical_pet_type(x) FROM unnest(COALESCE(sp.pet_types, ARRAY[]::text[])) x)))
    ),
    CASE WHEN v_meds THEN 'Pets with medication' = ANY (COALESCE(sp.comfortable_with, ARRAY[]::text[])) ELSE NULL END,
    (v_city IS NOT NULL AND lower(btrim(COALESCE(p.city, ''))) = v_city),
    st.id,
    st.status::text
  FROM apps
  LEFT JOIN public.profiles p ON p.id = apps.sitter_user_id
  LEFT JOIN public.sitter_profiles sp ON sp.user_id = apps.sitter_user_id
  LEFT JOIN revs ON revs.uid = apps.sitter_user_id
  LEFT JOIN rates ON rates.user_id = apps.sitter_user_id
  LEFT JOIN fit ON fit.app_id = apps.id
  -- The sit this application turned into (only for accepted ones), newest first.
  LEFT JOIN LATERAL (
    SELECT s.id, s.status
    FROM public.sits s
    WHERE apps.status = 'accepted'
      AND s.listing_id = apps.listing_id
      AND s.sitter_user_id = apps.sitter_user_id
      AND (s.sit_dates_id = apps.sit_dates_id
           OR (s.sit_dates_id IS NULL AND s.snapshot_start_date = apps.sd_start AND s.snapshot_end_date = apps.sd_end))
    ORDER BY s.created_at DESC
    LIMIT 1
  ) st ON true
  ORDER BY apps.sd_start, apps.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_listing_applicants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_applicants(uuid) TO authenticated;
