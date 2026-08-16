-- reset the audit test account's flag before the stricter guard is installed
UPDATE public.sitter_profiles sp
SET id_verified = false
WHERE EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = sp.user_id AND p.email LIKE 'audit.%@nomadnest-audit.com'
);

-- Requests coming through the API carry a JWT role claim. Inside a SECURITY
-- DEFINER function current_user is the function owner, so the previous guards
-- based on current_user never fired. Use the JWT role claim instead.
CREATE OR REPLACE FUNCTION public.request_is_end_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  ) = 'authenticated';
$$;

REVOKE EXECUTE ON FUNCTION public.request_is_end_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_is_end_user() FROM authenticated;

CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.request_is_end_user() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges to modify admin status';
  END IF;

  IF auth.uid() = NEW.id THEN
    IF NEW.founding_member IS DISTINCT FROM OLD.founding_member THEN RAISE EXCEPTION 'Insufficient privileges to modify founding member status'; END IF;
    IF NEW.membership_status IS DISTINCT FROM OLD.membership_status THEN RAISE EXCEPTION 'Insufficient privileges to modify membership status'; END IF;
    IF NEW.membership_type IS DISTINCT FROM OLD.membership_type THEN RAISE EXCEPTION 'Insufficient privileges to modify membership type'; END IF;
    IF NEW.membership_expiry IS DISTINCT FROM OLD.membership_expiry THEN RAISE EXCEPTION 'Insufficient privileges to modify membership expiry'; END IF;
    IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN RAISE EXCEPTION 'Insufficient privileges to modify email verified status'; END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN RAISE EXCEPTION 'Insufficient privileges to modify phone verified status'; END IF;
    IF NEW.id_verified IS DISTINCT FROM OLD.id_verified THEN RAISE EXCEPTION 'Insufficient privileges to modify id verified status'; END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_sitter_verification_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.request_is_end_user() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN NEW;
  END IF;

  IF NEW.id_verified IS DISTINCT FROM OLD.id_verified THEN
    RAISE EXCEPTION 'Insufficient privileges to modify ID verification status';
  END IF;

  IF NEW.background_check IS DISTINCT FROM OLD.background_check THEN
    RAISE EXCEPTION 'Insufficient privileges to modify background check status';
  END IF;

  RETURN NEW;
END;
$$;