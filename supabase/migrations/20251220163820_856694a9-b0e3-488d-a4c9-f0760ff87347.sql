-- Create a function to send push notification via edge function
CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  push_payload jsonb;
BEGIN
  -- Build the push notification payload
  push_payload := jsonb_build_object(
    'title', NEW.title,
    'body', NEW.message,
    'url', COALESCE(NEW.data->>'url', '/dashboard'),
    'tag', NEW.type,
    'data', NEW.data
  );

  -- Call the edge function to send push notification
  -- Using pg_net for async HTTP request
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id::text,
      'payload', push_payload
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the notification insert
    RAISE WARNING 'Failed to send push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger to call push notification function on notification insert
DROP TRIGGER IF EXISTS trigger_push_notification_on_insert ON public.notifications;
CREATE TRIGGER trigger_push_notification_on_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_insert();