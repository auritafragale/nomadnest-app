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

  -- Trusted SECURITY DEFINER routines (e.g. founding member code redemption)
  -- set this flag for the duration of their transaction only.
  IF coalesce(current_setting('app.trusted_membership_update', true), '') = 'on' THEN
    RETURN NEW;
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
$function$;