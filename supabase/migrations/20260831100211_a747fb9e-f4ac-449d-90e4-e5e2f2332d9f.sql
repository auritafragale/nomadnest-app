-- The push-on-insert trigger relied on database settings that were never set, so
-- it silently failed on every notification. Push is now sent by the
-- send-notification-email function itself, so the trigger is redundant.
DROP TRIGGER IF EXISTS trigger_push_notification_on_insert ON public.notifications;
DROP FUNCTION IF EXISTS public.notify_push_on_insert();