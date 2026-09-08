-- ═══════════════════════════════════════════════════════════════════════════
-- City Chat thread notifications
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Lets members "watch" a city-chat thread (a top-level message with
-- parent_message_id IS NULL) and get an in-app notification when someone
-- else replies. Replying auto-subscribes you; the frontend toggle is only
-- for watching a thread without posting in it.
--
-- NOT applied automatically — apply via the database tool per the usual
-- workflow for this project.


-- ─── 1. Subscriptions table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.city_chat_thread_subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_message_id uuid NOT NULL REFERENCES public.city_chat_messages(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_message_id, user_id)
);

CREATE INDEX IF NOT EXISTS city_chat_thread_subscriptions_thread_idx
  ON public.city_chat_thread_subscriptions (thread_message_id);

-- Lets a client fetch "which of these threads am I watching" in one query.
CREATE INDEX IF NOT EXISTS city_chat_thread_subscriptions_user_idx
  ON public.city_chat_thread_subscriptions (user_id);

GRANT SELECT, INSERT, DELETE ON public.city_chat_thread_subscriptions TO authenticated;
GRANT ALL ON public.city_chat_thread_subscriptions TO service_role;

ALTER TABLE public.city_chat_thread_subscriptions ENABLE ROW LEVEL SECURITY;

-- No public access: a member may only see/create/remove their own subscription
-- rows. (Whether they can still reach the underlying thread at all is
-- enforced separately by city_chat_messages' own RLS via can_access_city_chat.)
CREATE POLICY "Users can view own thread subscriptions"
ON public.city_chat_thread_subscriptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can subscribe themselves to a thread"
ON public.city_chat_thread_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unsubscribe themselves from a thread"
ON public.city_chat_thread_subscriptions
FOR DELETE
TO authenticated
USING (user_id = auth.uid());


-- ─── 2. AFTER INSERT trigger on city_chat_messages ────────────────────────
--
-- Fires only for replies (parent_message_id IS NOT NULL — a new top-level
-- thread message doesn't notify anyone, there's nothing to reply to yet).
--
--   a) Auto-subscribes the replier to the thread they just posted in.
--   b) Notifies every OTHER subscriber of that thread in-app.
--
-- Push notifications are intentionally NOT sent by this trigger — see the
-- comment block near the bottom of the function for why, and what it would
-- take to add them.

CREATE OR REPLACE FUNCTION public.notify_city_chat_thread_subscribers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_replier_name   text;
  v_room_id        uuid;
  v_thread_preview text;
  v_subscriber     record;
BEGIN
  IF NEW.parent_message_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (a) Auto-subscribe the replier. Isolated in its own block so a failure
  -- here can never roll back — or be rolled back by — the notification loop
  -- below; the two are independent guarantees.
  BEGIN
    INSERT INTO public.city_chat_thread_subscriptions (thread_message_id, user_id)
    VALUES (NEW.parent_message_id, NEW.sender_user_id)
    ON CONFLICT (thread_message_id, user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to auto-subscribe replier % to thread %: %',
        NEW.sender_user_id, NEW.parent_message_id, SQLERRM;
  END;

  -- (b) Notify every other subscriber of this thread, in-app.
  BEGIN
    SELECT COALESCE(NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''), 'Someone')
      INTO v_replier_name
    FROM public.profiles p
    WHERE p.id = NEW.sender_user_id;

    SELECT m.room_id, LEFT(m.content, 60)
      INTO v_room_id, v_thread_preview
    FROM public.city_chat_messages m
    WHERE m.id = NEW.parent_message_id;

    FOR v_subscriber IN
      SELECT s.user_id
      FROM public.city_chat_thread_subscriptions s
      WHERE s.thread_message_id = NEW.parent_message_id
        AND s.user_id <> NEW.sender_user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        v_subscriber.user_id,
        'city_chat_thread_reply',
        'New reply in "' || COALESCE(v_thread_preview, 'a thread you''re watching') || '"',
        v_replier_name || ' replied: ' || LEFT(NEW.content, 140),
        jsonb_build_object(
          'room_id', v_room_id,
          'thread_message_id', NEW.parent_message_id,
          'url', '/city-chat/' || v_room_id::text || '?thread=' || NEW.parent_message_id::text
        )
      );
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to notify subscribers of city chat thread %: %',
        NEW.parent_message_id, SQLERRM;
  END;

  -- ─── Push notifications: intentionally skipped, in-app only for now ───────
  --
  -- Searched the codebase for a generic "push to any user" mechanism this
  -- trigger could call (the vault-secret + net.http_post pattern used by
  -- sync_email_verified / notify_admins_on_id_verification /
  -- notify_member_on_id_verification_decision) and found none that fits:
  --
  --   * supabase/functions/send-push-notification derives the recipient from
  --     the CALLER'S OWN JWT by design ("the recipient is always the caller —
  --     never a user id from the body", per its own source comment). It is
  --     the member's "send a test push to myself" button, not a
  --     send-to-anyone primitive, and a DB trigger has no user JWT to hand it
  --     for the *other* subscriber it needs to reach.
  --   * supabase/functions/send-notification-email does send push to an
  --     arbitrary recipientUserId, but only alongside an email, only for a
  --     fixed enum of known `type` values with hand-built email templates
  --     (buildNotificationEmail) that doesn't include a chat-thread-reply
  --     case, and its "internal caller" bypass expects the raw
  --     SUPABASE_SERVICE_ROLE_KEY as the bearer token — a bigger secret to
  --     embed in a trigger than the internal_trigger_secret vault pattern
  --     used elsewhere. Repurposing it is a real change, not a reuse.
  --   * The previous generic mechanism — a trigger on public.notifications
  --     itself that pushed on every insert — was deliberately DROPPED in
  --     20260831100211_a747fb9e-f4ac-449d-90e4-e5e2f2332d9f.sql, with the
  --     note that push moved to being sent explicitly by application code
  --     instead. The two most recent comparable triggers added since then
  --     (notify_owner_on_sit_checkin, the sit-started trigger) both only
  --     INSERT INTO notifications and do not attempt any push call either —
  --     that is the current established pattern for new triggers, not an
  --     oversight this migration should route around.
  --
  -- So: in-app notification (above) ships now. Push is a fast-follow once
  -- there's a real generic send-push-to-user primitive to call — most likely
  -- by giving send-push-notification an internal-caller bypass (mirroring
  -- send-notification-email's) and calling it here with the vault secret,
  -- the same way the ID-verification triggers call their edge functions.

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_city_chat_thread_subscribers() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_city_chat_thread_subscribers ON public.city_chat_messages;
CREATE TRIGGER trg_notify_city_chat_thread_subscribers
AFTER INSERT ON public.city_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_city_chat_thread_subscribers();
