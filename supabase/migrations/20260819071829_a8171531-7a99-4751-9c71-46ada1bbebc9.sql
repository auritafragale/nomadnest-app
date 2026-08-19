-- 1) Hide sensitive contact columns on profiles from the client API
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, first_name, last_name, avatar_url, country, city, created_at, updated_at,
  full_name, bio, location, membership_type, founding_member, membership_status,
  membership_expiry, id_verified, onfido_applicant_id, onfido_check_id,
  email_verified, phone_verified, phone_verified_at, is_admin
) ON public.profiles TO authenticated;

-- 2) Hide phone on sitter/owner profiles
REVOKE SELECT ON public.sitter_profiles FROM authenticated;
REVOKE SELECT ON public.sitter_profiles FROM anon;
GRANT SELECT (
  id, user_id, headline, bio, why_i_sit, experience_level, experience_details,
  languages, comfortable_with, pet_types, sit_style, home_preferences,
  house_rules_compatibility, availability_type, available_from, available_to,
  preferred_regions, preferred_countries, preferred_cities, id_verified,
  background_check, social_links, gallery, age_range, created_at, updated_at,
  is_active, latitude, longitude, is_visible
) ON public.sitter_profiles TO authenticated;

REVOKE SELECT ON public.owner_profiles FROM authenticated;
REVOKE SELECT ON public.owner_profiles FROM anon;
GRANT SELECT (
  id, user_id, bio, created_at, updated_at, is_active
) ON public.owner_profiles TO authenticated;

-- 3) Own contact info via a secure lookup
CREATE OR REPLACE FUNCTION public.get_my_contact_info()
RETURNS TABLE(email text, phone_number text, phone_verified boolean, phone_line_type text, sitter_phone text, owner_phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email, p.phone_number, p.phone_verified, p.phone_line_type,
         (SELECT sp.phone FROM public.sitter_profiles sp WHERE sp.user_id = p.id LIMIT 1),
         (SELECT op.phone FROM public.owner_profiles op WHERE op.user_id = p.id LIMIT 1)
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_contact_info() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_contact_info() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_contact_info() TO authenticated;

-- 4) Admin ID verification queue (needs submitter email)
CREATE OR REPLACE FUNCTION public.admin_list_id_verifications()
RETURNS TABLE(
  id uuid, user_id uuid, id_photo_path text, selfie_path text, status text,
  reviewed_by uuid, reviewed_at timestamptz, notes text, created_at timestamptz,
  first_name text, last_name text, email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.user_id, v.id_photo_path, v.selfie_path, v.status,
         v.reviewed_by, v.reviewed_at, v.notes, v.created_at,
         p.first_name, p.last_name, p.email
  FROM public.manual_id_verifications v
  LEFT JOIN public.profiles p ON p.id = v.user_id
  WHERE public.is_admin_user(auth.uid())
  ORDER BY v.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_list_id_verifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_id_verifications() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_id_verifications() TO authenticated;

-- 5) Make sign-up failure-proof
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name'
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;