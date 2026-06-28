-- Set the Supabase project URL so the DB trigger can call the edge function.
-- The service role key is NOT needed here because send-push-notification now
-- runs with verify_jwt = false (it's a push-only function, no data mutation).
ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://vcmfvmspymqzwqyxjepi.supabase.co';

-- Update notify_push_on_insert to call the edge function without an Authorization
-- header (JWT verification is disabled on send-push-notification).
-- Also fixed the payload shape to match what the edge function expects.
CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  supabase_url text;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);

  IF supabase_url IS NULL OR supabase_url = '' THEN
    RAISE WARNING 'app.settings.supabase_url not configured, skipping push notification';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/send-push-notification',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object(
      'user_id', NEW.user_id::text,
      'payload', jsonb_build_object(
        'title', NEW.title,
        'body',  NEW.message,
        'url',   COALESCE(NEW.data->>'url', '/dashboard'),
        'tag',   NEW.type,
        'data',  NEW.data
      )
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_push_on_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_insert() FROM anon;
