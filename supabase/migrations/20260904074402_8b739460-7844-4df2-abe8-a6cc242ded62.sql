ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'cancelled';

CREATE OR REPLACE FUNCTION public.cancel_applications_on_sit_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    UPDATE public.applications
    SET status = 'cancelled'::public.application_status,
        updated_at = now()
    WHERE sit_dates_id = NEW.sit_dates_id
      AND sitter_user_id = NEW.sitter_user_id
      AND status IN ('accepted'::public.application_status, 'applied'::public.application_status, 'shortlisted'::public.application_status);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_applications_on_sit_cancel ON public.sits;
CREATE TRIGGER trg_cancel_applications_on_sit_cancel
AFTER UPDATE ON public.sits
FOR EACH ROW
EXECUTE FUNCTION public.cancel_applications_on_sit_cancel();