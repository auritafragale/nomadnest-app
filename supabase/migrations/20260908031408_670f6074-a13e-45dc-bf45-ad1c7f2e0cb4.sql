CREATE OR REPLACE FUNCTION public.notify_admins_on_id_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_trigger_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'internal_trigger_secret missing from vault';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/notify-admin-verification-submitted',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body    := jsonb_build_object('verification_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to notify admins of ID verification: %', SQLERRM;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_member_on_id_verification_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_message text;
  v_secret text;
BEGIN
  IF NEW.status = OLD.status OR NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    v_title := 'Identity Verified';
    v_message := 'Your identity has been verified. Your verified badge is now visible to the community.';
  ELSE
    v_title := 'ID Verification Unsuccessful';
    v_message := 'Your ID verification was not approved'
      || COALESCE(': ' || NEW.notes, '')
      || '. You can resubmit via Settings → Verification.';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.user_id,
    'id_verification_status',
    v_title,
    v_message,
    jsonb_build_object(
      'url', CASE WHEN NEW.status = 'approved' THEN '/dashboard' ELSE '/verify-identity' END,
      'status', NEW.status,
      'notes', NEW.notes,
      'verification_id', NEW.id::text
    )
  );

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_trigger_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'internal_trigger_secret missing from vault';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/notify-verification-decision',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body    := jsonb_build_object('verification_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to notify member of ID verification decision: %', SQLERRM;
    RETURN NEW;
END;
$function$;