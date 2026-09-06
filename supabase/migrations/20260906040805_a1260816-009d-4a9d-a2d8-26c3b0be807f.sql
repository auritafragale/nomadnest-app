CREATE OR REPLACE FUNCTION public.notify_sitter_sit_started()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'in_progress' AND COALESCE(OLD.status, '') <> 'in_progress' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      NEW.sitter_user_id,
      'sit_started',
      'Your sit has started',
      'Pop into the chat with your Pet Parent each day and tap Fed, Meds and Walk to log today''s care. A photo and short note make it even better.',
      jsonb_build_object('url', '/inbox', 'sit_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$function$;