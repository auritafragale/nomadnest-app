CREATE OR REPLACE FUNCTION public.sync_email_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.profiles
    SET email_verified = true
    WHERE id = NEW.id;

    BEGIN
      SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets
      WHERE name = 'internal_trigger_secret';

      IF v_secret IS NULL THEN
        RAISE WARNING 'internal_trigger_secret missing from vault';
        RETURN NEW;
      END IF;

      PERFORM net.http_post(
        url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/send-welcome-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_secret
        ),
        body    := jsonb_build_object('user_id', NEW.id::text)
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to send welcome email: %', SQLERRM;
        RETURN NEW;
    END;
  END IF;

  RETURN NEW;
END;
$function$;