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

-- Recompute a member's role from their base role and plan, and make sure
-- they have the profiles their role needs.
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
  -- The plan added a side the member did not set up at onboarding: give
  -- them that profile (onboarding creates the ones they chose).
  IF v_role IN ('sitter', 'both') AND COALESCE(r.base_role, r.role) NOT IN ('sitter', 'both') THEN
    -- A new, empty Nomad profile stays hidden until the member fills it in.
    INSERT INTO public.sitter_profiles (user_id, is_visible, is_active) VALUES (p_user_id, false, false)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  IF v_role IN ('owner', 'both') AND COALESCE(r.base_role, r.role) NOT IN ('owner', 'both') THEN
    INSERT INTO public.owner_profiles (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  END IF;
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
