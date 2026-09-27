-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: public_profiles failing for signed-out visitors ("Pet Owner" cards)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- public_profiles runs with the caller's rights (security_invoker) and its
-- WHERE clause read public.sits directly. anon has had no privileges on sits
-- since the sits hardening (20260926090100: REVOKE ALL ON sits FROM anon), so
-- every signed-out read of the view failed with "permission denied for table
-- sits": listing owner cards and Browse sits cards fell back to "Pet Owner".
--
-- The "is this member discoverable?" rule moves into a SECURITY DEFINER
-- helper that returns only a yes/no for one member. The view keeps the same
-- rows, the same columns and invoker rights; callers no longer need access
-- to sits, listings, sitter_profiles or owner_profiles to read it.


CREATE OR REPLACE FUNCTION public.profile_is_discoverable(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.sitter_profiles sp WHERE sp.user_id = p_user_id AND sp.is_visible IS TRUE)
      OR EXISTS (SELECT 1 FROM public.owner_profiles op WHERE op.user_id = p_user_id AND op.is_active IS TRUE)
      OR EXISTS (SELECT 1 FROM public.listings l WHERE l.owner_user_id = p_user_id AND l.status = 'published')
      OR EXISTS (SELECT 1 FROM public.sits s WHERE s.owner_user_id = p_user_id OR s.sitter_user_id = p_user_id);
$function$;

-- Explicit grants (new functions get no PUBLIC/anon EXECUTE by default).
REVOKE ALL ON FUNCTION public.profile_is_discoverable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_is_discoverable(uuid) TO anon, authenticated, service_role;

-- Same view, same columns; only the row filter moved into the helper.
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT p.id, p.first_name, p.last_name, p.avatar_url, p.city, p.country,
       p.bio, p.location, p.full_name,
       p.id_verified, p.email_verified, p.phone_verified,
       p.founding_badge AS founding_member
FROM public.profiles p
WHERE public.profile_is_discoverable(p.id);

ALTER VIEW public.public_profiles SET (security_invoker = true);
GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;
