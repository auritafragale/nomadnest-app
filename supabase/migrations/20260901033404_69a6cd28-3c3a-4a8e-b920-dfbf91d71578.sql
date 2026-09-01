-- 1. Column-level lockdown: profiles
REVOKE SELECT (email, phone_number, phone_verified, phone_verified_at, phone_line_type, onfido_applicant_id, onfido_check_id, membership_status, membership_type, membership_expiry, founding_member, is_admin) ON public.profiles FROM anon, authenticated;

-- 2. Column-level lockdown: sitter_profiles
REVOKE SELECT (phone, id_verified) ON public.sitter_profiles FROM anon, authenticated;

-- 3. Column-level lockdown: owner_profiles
REVOKE SELECT (phone) ON public.owner_profiles FROM anon, authenticated;

-- 4. Anonymous visitors no longer read the raw profiles table
DROP POLICY IF EXISTS "Public can view basic profile info" ON public.profiles;

-- 5. Safe public view (only display fields; owner = postgres so anon can
--    select through it without column grants on the base table)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, first_name, last_name, avatar_url, city, country,
       bio, location, full_name,
       id_verified, email_verified, phone_verified,
       CASE WHEN founding_member IS TRUE AND membership_status = 'active'
            THEN TRUE ELSE FALSE END AS is_founding_member
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT SELECT ON public.public_profiles TO service_role;

-- 6. Guard own-contact lookup against anonymous callers
CREATE OR REPLACE FUNCTION public.get_my_contact_info()
RETURNS TABLE(email text, phone_number text, phone_verified boolean, phone_line_type text, sitter_phone text, owner_phone text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email, p.phone_number, p.phone_verified, p.phone_line_type,
         (SELECT sp.phone FROM public.sitter_profiles sp WHERE sp.user_id = p.id LIMIT 1),
         (SELECT op.phone FROM public.owner_profiles op WHERE op.user_id = p.id LIMIT 1)
  FROM public.profiles p
  WHERE p.id = auth.uid() AND auth.uid() IS NOT NULL;
$$;