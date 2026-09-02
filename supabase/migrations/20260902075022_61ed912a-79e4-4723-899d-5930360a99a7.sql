CREATE OR REPLACE FUNCTION public.get_my_membership()
RETURNS TABLE(founding_member boolean, membership_status text, membership_type text, membership_expiry timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.founding_member, p.membership_status, p.membership_type, p.membership_expiry
  FROM public.profiles p
  WHERE p.id = auth.uid() AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_membership() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_verification()
RETURNS TABLE(id_verified boolean, onfido_applicant_id text, onfido_check_id text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id_verified, p.onfido_applicant_id, p.onfido_check_id
  FROM public.profiles p
  WHERE p.id = auth.uid() AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_verification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_verification() TO authenticated;