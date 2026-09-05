CREATE OR REPLACE FUNCTION public.notify_sitter_sit_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND COALESCE(OLD.status, '') <> 'in_progress' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      NEW.sitter_user_id,
      'sit_started',
      'Your sit has started',
      'Please post a daily check-in — Pets Fed, Meds Given and Walk Completed — every day of the sit so the Pet Parent stays reassured.',
      jsonb_build_object('url', '/sits/' || NEW.id::text, 'sit_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_sitter_sit_started ON public.sits;
CREATE TRIGGER trg_notify_sitter_sit_started
AFTER UPDATE OF status ON public.sits
FOR EACH ROW
EXECUTE FUNCTION public.notify_sitter_sit_started();