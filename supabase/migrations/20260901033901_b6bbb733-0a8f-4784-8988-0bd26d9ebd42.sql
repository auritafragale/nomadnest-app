CREATE OR REPLACE FUNCTION public.prevent_sitter_verification_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only end-user (authenticated role) writes are restricted; the backend
  -- (service role, e.g. onfido-webhook) and direct admin tooling may proceed.
  IF coalesce(current_setting('role', true), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Admins may adjust verification flags (manual review flow).
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

DROP TRIGGER IF EXISTS prevent_sitter_verification_escalation ON public.sitter_profiles;
CREATE TRIGGER prevent_sitter_verification_escalation
BEFORE UPDATE ON public.sitter_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_sitter_verification_escalation();