CREATE OR REPLACE FUNCTION public.notify_admins_on_id_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/notify-admin-verification-submitted',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', '07922646fa622b6769591a390dba505152aeeb80a4544b98462fce2f9f30352f'
    ),
    body    := jsonb_build_object('verification_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to notify admins of ID verification: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_member_on_id_verification_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_message text;
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

  PERFORM net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/notify-verification-decision',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', '07922646fa622b6769591a390dba505152aeeb80a4544b98462fce2f9f30352f'
    ),
    body    := jsonb_build_object('verification_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to notify member of ID verification decision: %', SQLERRM;
    RETURN NEW;
END;
$$;