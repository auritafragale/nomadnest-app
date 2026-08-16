-- 1. user_roles: allow users to update their own role row (role upgrade + onboarding completion)
CREATE POLICY "Users can update own role"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT UPDATE ON public.user_roles TO authenticated;

-- 2. notifications: admins may insert; regular inserts happen via triggers below
CREATE POLICY "Admins can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

GRANT INSERT ON public.notifications TO authenticated;

-- 2b. trigger: create the sitter's notification when an invite is sent
CREATE OR REPLACE FUNCTION public.notify_sitter_on_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM public.listings WHERE id = NEW.listing_id;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.sitter_user_id,
    'invite',
    'New sit invitation',
    'You have been invited to sit at ' || COALESCE(v_title, 'a home'),
    jsonb_build_object(
      'url', '/applications',
      'listing_id', NEW.listing_id::text,
      'invite_id', NEW.id::text
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_sitter_on_invite ON public.sitter_invites;
CREATE TRIGGER notify_sitter_on_invite
AFTER INSERT ON public.sitter_invites
FOR EACH ROW EXECUTE FUNCTION public.notify_sitter_on_invite();

-- 3. city_chat_rooms: signed-in users may create a room for a city
CREATE POLICY "Authenticated users can create rooms"
ON public.city_chat_rooms
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

GRANT INSERT ON public.city_chat_rooms TO authenticated;

-- 4. sitter_profiles: block self-service id_verified changes
CREATE OR REPLACE FUNCTION public.prevent_sitter_verification_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.id_verified IS DISTINCT FROM OLD.id_verified
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Insufficient privileges to modify ID verification status';
  END IF;

  IF NEW.background_check IS DISTINCT FROM OLD.background_check
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Insufficient privileges to modify background check status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_sitter_verification_escalation ON public.sitter_profiles;
CREATE TRIGGER prevent_sitter_verification_escalation
BEFORE UPDATE ON public.sitter_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_sitter_verification_escalation();

-- 5. hardening: fixed search_path on remaining functions
CREATE OR REPLACE FUNCTION public.can_access_city_chat(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_city text;
  v_country text;
BEGIN
  SELECT city, country INTO v_city, v_country
  FROM public.city_chat_rooms WHERE id = p_room_id;

  IF v_city IS NULL THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.sitter_profiles sp
    JOIN public.profiles p ON p.id = sp.user_id
    WHERE sp.user_id = p_user_id
      AND sp.is_visible = true
      AND LOWER(TRIM(p.city)) = LOWER(TRIM(v_city))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sits s
    JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
    JOIN public.listings l ON l.id = s.listing_id
    WHERE s.sitter_user_id = p_user_id
      AND s.status = 'confirmed'
      AND sd.end_date >= CURRENT_DATE
      AND sd.start_date <= CURRENT_DATE + INTERVAL '7 days'
      AND LOWER(TRIM(l.city)) = LOWER(TRIM(v_city))
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_unread_messages_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE (c.owner_user_id = auth.uid() OR c.sitter_user_id = auth.uid())
    AND m.sender_user_id <> auth.uid()
    AND m.read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.upsert_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_city_chat(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_unread_messages_count() FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text) FROM anon;