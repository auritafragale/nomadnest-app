-- ═══════════════════════════════════════════════════════════════════════════
-- Central push: every in-app notification row sends one push
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. AFTER INSERT trigger on public.notifications calls send-push-notification
--    through pg_net with the internal_trigger_secret from Vault (the same
--    pattern as the ID-verification and welcome-email triggers). It sends ONLY
--    the notification id; the function loads the row and pushes to its own
--    user_id with its own title, message and data.url. No subscription = no
--    push (the per-device switch in Settings). A push failure never blocks the
--    notification insert.
--    Requires send-push-notification deployed with its internal mode and
--    verify_jwt = false (see supabase/config.toml).
-- 2. notifications UPDATE: members can only change read_at on their own rows
--    (column privilege + policy WITH CHECK). INSERT stays admin-only for
--    members; triggers, edge functions and the service role insert the rest.
-- 3. notify_sitter_on_invite: tap-through URL now opens the Nomad's invites
--    (it pointed at /applications, the Pet Parent's page). The app no longer
--    also creates a second in-app row for invites.
--
-- SECRETS: never put a secret value in a migration. Read it from Vault only
-- (vault.decrypted_secrets), as below.


-- ─── 1. Push trigger ────────────────────────────────────────────────────────

-- Old generic push trigger (dropped in 20260831100211); make sure it's gone.
DROP TRIGGER IF EXISTS trigger_push_notification_on_insert ON public.notifications;
DROP FUNCTION IF EXISTS public.notify_push_on_insert();

CREATE OR REPLACE FUNCTION public.push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_trigger_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'internal_trigger_secret missing from vault; push skipped';
    RETURN NEW;
  END IF;

  -- pg_net queues the request and sends it after this transaction commits,
  -- so the function always finds the committed row.
  PERFORM net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body    := jsonb_build_object('notification_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to queue push for notification %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.push_on_notification_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS push_on_notification_insert ON public.notifications;
CREATE TRIGGER push_on_notification_insert
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.push_on_notification_insert();


-- ─── 2. notifications: members may only mark their own rows read ───────────

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Column-level: read_at is the only column members can update.
REVOKE UPDATE ON public.notifications FROM anon, authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

-- anon never needs this table (the SELECT policy only matches auth.uid()).
REVOKE ALL ON public.notifications FROM anon;


-- ─── 3. Invite notification: open the Nomad's invites ──────────────────────

CREATE OR REPLACE FUNCTION public.notify_sitter_on_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM public.listings WHERE id = NEW.listing_id;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.sitter_user_id,
    'invite',
    'New sit invitation',
    'You have been invited to sit at ' || COALESCE(v_title, 'a home'),
    jsonb_build_object(
      'url', '/dashboard?mode=sitter&section=invites',
      'listing_id', NEW.listing_id::text,
      'invite_id', NEW.id::text
    )
  );
  RETURN NEW;
END;
$function$;