-- ═══════════════════════════════════════════════════════════════════════════
-- Privacy hardening, batch 1: additive only (nothing is revoked here)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- New safe paths the app switches to BEFORE batch 3 removes direct access:
-- 1. get_my_settings(): the caller's own private profile settings
--    (preferred_language). Fixes Settings showing "Don't translate": members
--    have no SELECT on profiles.preferred_language, and never will.
-- 2. admin_get_member_contact(): email and reliability score for admins.
-- 3. get_community_warnings(): only the warning categories for one profile
--    or listing (replaces reading community_strikes rows directly).
-- 4. profiles.founding_badge: the public "founding member" badge as one
--    boolean, so the public_profiles view no longer needs membership_status.
-- 5. listings.approx_latitude / approx_longitude: a random point within
--    ~500 m of the home, generated once and only regenerated when the real
--    location changes. Public maps use these; exact coordinates will become
--    owner/server only in batch 3 (get_listing_exact_location for the owner).
-- 6. sitter_profiles latitude/longitude rounded to 2 decimals (~1 km), on
--    every write, plus a backfill.
-- 7. Private chat-photos bucket policies: {conversation_id}/{file}, readable
--    by the conversation's two members and admins. The bucket itself is
--    created through the Storage API (never in a migration).
--
-- SECRETS: none.


-- ─── 1. Own settings ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('preferred_language', p.preferred_language)
  FROM public.profiles p
  WHERE p.id = auth.uid() AND auth.uid() IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_my_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_settings() TO authenticated;


-- ─── 2. Admin: a member's contact details ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_member_contact(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object('full_name', p.full_name, 'email', p.email, 'reliability_score', p.reliability_score)
    FROM public.profiles p WHERE p.id = p_user_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_member_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_member_contact(uuid) TO authenticated;


-- ─── 3. Community warnings for one subject ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_community_warnings(p_subject_type text, p_subject_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT cs.category ORDER BY cs.category), '{}')
  FROM public.community_strikes cs
  WHERE auth.uid() IS NOT NULL
    AND cs.subject_type = p_subject_type
    AND cs.subject_id = p_subject_id
    AND cs.show_strike_three_warning = true;
$function$;

REVOKE ALL ON FUNCTION public.get_community_warnings(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_community_warnings(text, uuid) TO authenticated;


-- ─── 4. Public founding badge ──────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS founding_badge boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_profile_founding_badge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.founding_badge := COALESCE(NEW.founding_member, false) AND NEW.membership_status = 'active';
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_profile_founding_badge() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_profile_founding_badge ON public.profiles;
CREATE TRIGGER set_profile_founding_badge
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_profile_founding_badge();

UPDATE public.profiles
SET founding_badge = COALESCE(founding_member, false) AND membership_status = 'active'
WHERE founding_badge IS DISTINCT FROM (COALESCE(founding_member, false) AND membership_status = 'active');

GRANT SELECT (founding_badge) ON public.profiles TO anon, authenticated;

-- Same view, same columns; the badge now comes from founding_badge.
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT p.id, p.first_name, p.last_name, p.avatar_url, p.city, p.country,
       p.bio, p.location, p.full_name,
       p.id_verified, p.email_verified, p.phone_verified,
       p.founding_badge AS founding_member
FROM public.profiles p
WHERE EXISTS (SELECT 1 FROM public.sitter_profiles sp
              WHERE sp.user_id = p.id AND sp.is_visible IS TRUE)
   OR EXISTS (SELECT 1 FROM public.owner_profiles op
              WHERE op.user_id = p.id AND op.is_active IS TRUE)
   OR EXISTS (SELECT 1 FROM public.listings l
              WHERE l.owner_user_id = p.id AND l.status = 'published')
   OR EXISTS (SELECT 1 FROM public.sits s
              WHERE s.owner_user_id = p.id OR s.sitter_user_id = p.id);

ALTER VIEW public.public_profiles SET (security_invoker = true);
GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;


-- ─── 5. Approximate listing location ───────────────────────────────────────

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS approx_latitude numeric,
  ADD COLUMN IF NOT EXISTS approx_longitude numeric;

-- A uniformly random point within p_radius_m metres of (lat, lng).
CREATE OR REPLACE FUNCTION public.random_point_near(p_lat numeric, p_lng numeric, p_radius_m numeric DEFAULT 500)
RETURNS TABLE (lat numeric, lng numeric)
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  v_r double precision := p_radius_m * sqrt(random());
  v_t double precision := 2 * pi() * random();
  v_cos double precision := GREATEST(cos(radians(p_lat::double precision)), 0.01);
BEGIN
  lat := round((p_lat + (v_r * cos(v_t)) / 111320.0)::numeric, 6);
  lng := round((p_lng + (v_r * sin(v_t)) / (111320.0 * v_cos))::numeric, 6);
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.random_point_near(numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_listing_approx_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.approx_latitude := NULL;
    NEW.approx_longitude := NULL;
  ELSIF TG_OP = 'INSERT'
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR OLD.approx_latitude IS NULL THEN
    SELECT r.lat, r.lng INTO NEW.approx_latitude, NEW.approx_longitude
    FROM public.random_point_near(NEW.latitude, NEW.longitude, 500) r;
  ELSE
    -- Never re-randomised on edit; members can't set it themselves.
    NEW.approx_latitude := OLD.approx_latitude;
    NEW.approx_longitude := OLD.approx_longitude;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_listing_approx_location() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_listing_approx_location ON public.listings;
CREATE TRIGGER set_listing_approx_location
BEFORE INSERT OR UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.set_listing_approx_location();

-- Backfill once: the trigger fills approx_* because they're still NULL.
-- (Touching approx_latitude, not latitude, so the listing time-zone trigger
-- doesn't re-run for every listing.)
UPDATE public.listings SET approx_latitude = NULL
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND approx_latitude IS NULL;

GRANT SELECT (approx_latitude, approx_longitude) ON public.listings TO anon, authenticated;

-- The owner's exact location, for their own edit form.
CREATE OR REPLACE FUNCTION public.get_listing_exact_location(p_listing_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('latitude', l.latitude, 'longitude', l.longitude)
  FROM public.listings l
  WHERE l.id = p_listing_id AND l.owner_user_id = auth.uid() AND auth.uid() IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_listing_exact_location(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_exact_location(uuid) TO authenticated;


-- ─── 6. Sitter location: city level ────────────────────────────────────────

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
WHERE latitude IS NOT NULL
  AND (latitude <> round(latitude::numeric, 2) OR longitude <> round(longitude::numeric, 2));


-- ─── 7. Private chat photos ────────────────────────────────────────────────
-- Object names: {conversation_id}/{uuid}.jpg

CREATE OR REPLACE FUNCTION public.chat_photo_conversation(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN split_part(p_name, '/', 1)::uuid
  END;
$function$;

CREATE OR REPLACE FUNCTION public.can_upload_chat_photo(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_name ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = public.chat_photo_conversation(p_name)
        AND auth.uid() IN (c.owner_user_id, c.sitter_user_id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_read_chat_photo(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = public.chat_photo_conversation(p_name)
        AND auth.uid() IN (c.owner_user_id, c.sitter_user_id)
    )
    OR public.is_admin_user(auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.chat_photo_conversation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_upload_chat_photo(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_chat_photo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_photo_conversation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_chat_photo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_chat_photo(text) TO authenticated;

DROP POLICY IF EXISTS "Chat members upload chat photos" ON storage.objects;
CREATE POLICY "Chat members upload chat photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-photos' AND public.can_upload_chat_photo(name));

DROP POLICY IF EXISTS "Chat members and admins read chat photos" ON storage.objects;
CREATE POLICY "Chat members and admins read chat photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-photos' AND public.can_read_chat_photo(name));

DROP POLICY IF EXISTS "Senders delete their own chat photos" ON storage.objects;
CREATE POLICY "Senders delete their own chat photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-photos' AND owner_id = auth.uid()::text AND public.can_upload_chat_photo(name));

-- Never again: no chat photos in the public listing-images bucket.
DROP POLICY IF EXISTS "No chat photos in listing-images" ON storage.objects;
CREATE POLICY "No chat photos in listing-images"
ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (bucket_id <> 'listing-images' OR name !~* '(^|/)chat-?photos?(/|$)');