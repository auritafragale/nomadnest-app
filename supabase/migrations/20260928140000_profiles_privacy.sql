-- Profiles privacy: no signed-out reads, first names between members.
--
-- 1. Signed-out visitors (anon) can't read profiles or public_profiles at
--    all. The two signed-out pages that show a host (Browse sits cards and a
--    listing page) get first name + photo from get_public_member_cards().
-- 2. Signed-in members can't read anyone's last_name, full_name or location
--    (not even their own through the table: get_my_profile() returns the
--    caller's own full row).
-- 3. public_profiles drops last_name, full_name and location.
-- 4. Member-facing notifications use first names only.


-- ─── 1 and 2. Table access ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view profile display fields" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;

-- Column list for members. Revoking the table-level SELECT also clears the
-- old column grants, so this is the complete list.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, first_name, avatar_url, bio, city, country, created_at, updated_at,
  email_verified, phone_verified, id_verified, founding_badge
) ON public.profiles TO authenticated;


-- ─── 3. public_profiles without last names ─────────────────────────────────
-- Columns can't be removed with CREATE OR REPLACE, so the view is recreated.

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT p.id, p.first_name, p.avatar_url, p.city, p.country, p.bio,
       p.id_verified, p.email_verified, p.phone_verified,
       p.founding_badge AS founding_member
FROM public.profiles p
WHERE public.profile_is_discoverable(p.id);

REVOKE ALL ON public.public_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.public_profiles TO authenticated, service_role;

-- Only members see whether someone is discoverable.
REVOKE EXECUTE ON FUNCTION public.profile_is_discoverable(uuid) FROM anon;


-- Signed-out pages: first name and photo of discoverable members, nothing else.
CREATE OR REPLACE FUNCTION public.get_public_member_cards(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'first_name', NULLIF(TRIM(p.first_name), ''),
    'avatar_url', p.avatar_url
  )), '[]'::jsonb)
  FROM public.profiles p
  WHERE p.id = ANY (p_user_ids[1:100])
    AND public.profile_is_discoverable(p.id);
$function$;

REVOKE ALL ON FUNCTION public.get_public_member_cards(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_member_cards(uuid[]) TO anon, authenticated, service_role;


-- The caller's own full profile row (edit profile, settings, onboarding).
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(p) - 'is_admin' - 'onfido_applicant_id' - 'onfido_check_id'
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;


-- ─── 4. First names in member-facing notifications ─────────────────────────

CREATE OR REPLACE FUNCTION public.notify_review_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sit record;
  v_reviewer text;
  v_url text;
BEGIN
  IF NEW.reviewee_user_id IS NULL OR NEW.reviewer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT owner_user_id, sitter_user_id INTO v_sit FROM public.sits WHERE id = NEW.sit_id;
  -- First name only between members.
  SELECT NULLIF(TRIM(first_name), '') INTO v_reviewer FROM public.profiles WHERE id = NEW.reviewer_user_id;

  -- The reviewee's own reviews page: the Nomad's when the Pet Parent reviewed.
  v_url := CASE WHEN NEW.reviewee_user_id = v_sit.sitter_user_id
                THEN '/sitter/' || NEW.reviewee_user_id::text || '/reviews'
                ELSE '/owner/' || NEW.reviewee_user_id::text || '/reviews' END;

  -- send-notification-email creates the in-app row (which pushes) and the email.
  PERFORM public.request_internal_function('send-notification-email', jsonb_build_object(
    'type', 'review',
    'recipientUserId', NEW.reviewee_user_id::text,
    'data', jsonb_build_object(
      'reviewerName', COALESCE(v_reviewer, 'Someone'),
      'rating', NEW.rating::text,
      'text', left(COALESCE(TRIM(NEW.text), ''), 500),
      'url', v_url,
      'sit_id', NEW.sit_id::text
    )
  ));
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block the review itself.
    RAISE WARNING 'Review notification not queued for review %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_review_received() FROM PUBLIC, anon, authenticated;

-- Same as before, with the replier's first name only.
CREATE OR REPLACE FUNCTION public.notify_city_chat_thread_subscribers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

    SELECT m.room_id, LEFT(m.content, 60)
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
        'New reply in "' || COALESCE(v_thread_preview, 'a thread you''re watching') || '"',
        v_replier_name || ' replied: ' || LEFT(NEW.content, 140),
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


-- ─── 5. Nomad and Pet Parent profiles: members only ────────────────────────
-- Signed-out visitors can't read sitter_profiles or owner_profiles at all
-- (they held coordinates, age range, dates, cities, gallery and bio).

DROP POLICY IF EXISTS "Anyone can view visible nomad profiles" ON public.sitter_profiles;
DROP POLICY IF EXISTS "Anyone can view active pet parent profiles" ON public.owner_profiles;
REVOKE SELECT ON public.sitter_profiles FROM anon;
REVOKE SELECT ON public.owner_profiles FROM anon;

-- A hidden or paused Nomad stays visible to a Pet Parent they're already
-- dealing with (an application, invite or sit with that Pet Parent), so the
-- Pet Parent can still review them. Everyone else sees only visible Nomads.
CREATE OR REPLACE FUNCTION public.nomad_profile_shared_with_me(p_sitter_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.applications a JOIN public.listings l ON l.id = a.listing_id
            WHERE a.sitter_user_id = p_sitter_id AND l.owner_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.sitter_invites i
               WHERE i.sitter_user_id = p_sitter_id AND i.owner_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.sits s
               WHERE s.sitter_user_id = p_sitter_id AND s.owner_user_id = auth.uid())
  );
$function$;

REVOKE ALL ON FUNCTION public.nomad_profile_shared_with_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomad_profile_shared_with_me(uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view sitter profiles" ON public.sitter_profiles;
CREATE POLICY "Authenticated users can view sitter profiles"
ON public.sitter_profiles FOR SELECT TO authenticated
USING (
  (is_active IS TRUE AND is_visible IS TRUE)
  OR auth.uid() = user_id
  OR public.nomad_profile_shared_with_me(user_id)
);

-- owner_profiles has no separate visibility flag: active (not paused) or own.
DROP POLICY IF EXISTS "Authenticated users can view owner profiles" ON public.owner_profiles;
CREATE POLICY "Authenticated users can view owner profiles"
ON public.owner_profiles FOR SELECT TO authenticated
USING (is_active IS TRUE OR auth.uid() = user_id);


-- ─── 6. Nomad coordinates: always about 1 km (2 decimals) ──────────────────
-- The rounding trigger (from privacy batch 1) is re-asserted, and a CHECK
-- makes a precise value impossible to store even if the trigger were removed.

CREATE OR REPLACE FUNCTION public.round_sitter_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.latitude := round(NEW.latitude::numeric, 2);
  NEW.longitude := round(NEW.longitude::numeric, 2);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.round_sitter_location() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS round_sitter_location ON public.sitter_profiles;
CREATE TRIGGER round_sitter_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.sitter_profiles
FOR EACH ROW EXECUTE FUNCTION public.round_sitter_location();

UPDATE public.sitter_profiles
SET latitude = round(latitude::numeric, 2), longitude = round(longitude::numeric, 2)
WHERE (latitude IS NOT NULL AND latitude::numeric <> round(latitude::numeric, 2))
   OR (longitude IS NOT NULL AND longitude::numeric <> round(longitude::numeric, 2));

ALTER TABLE public.sitter_profiles DROP CONSTRAINT IF EXISTS sitter_profiles_location_rounded;
ALTER TABLE public.sitter_profiles ADD CONSTRAINT sitter_profiles_location_rounded CHECK (
  (latitude IS NULL OR latitude::numeric = round(latitude::numeric, 2))
  AND (longitude IS NULL OR longitude::numeric = round(longitude::numeric, 2))
);
