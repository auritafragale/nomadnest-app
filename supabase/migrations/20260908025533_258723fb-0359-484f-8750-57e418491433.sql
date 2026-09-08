-- 1. Notify admins when a new manual ID verification is submitted
CREATE OR REPLACE FUNCTION public.notify_admins_on_id_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  supabase_url text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL OR supabase_url = '' THEN
    RAISE WARNING 'app.settings.supabase_url not configured, skipping admin verification email';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/notify-admin-verification-submitted',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('verification_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to notify admins of ID verification: %', SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_admins_on_id_verification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_admins_on_id_verification ON public.manual_id_verifications;
CREATE TRIGGER notify_admins_on_id_verification
AFTER INSERT ON public.manual_id_verifications
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_id_verification();

-- 2. Notify the member when an admin approves or rejects their submission
CREATE OR REPLACE FUNCTION public.notify_member_on_id_verification_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  supabase_url text;
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

  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL OR supabase_url = '' THEN
    RAISE WARNING 'app.settings.supabase_url not configured, skipping verification decision email';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/notify-verification-decision',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('verification_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to notify member of ID verification decision: %', SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_member_on_id_verification_decision() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_member_on_id_verification_decision ON public.manual_id_verifications;
CREATE TRIGGER notify_member_on_id_verification_decision
AFTER UPDATE OF status ON public.manual_id_verifications
FOR EACH ROW EXECUTE FUNCTION public.notify_member_on_id_verification_decision();