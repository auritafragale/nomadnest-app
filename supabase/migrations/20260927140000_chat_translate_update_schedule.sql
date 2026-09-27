-- ═══════════════════════════════════════════════════════════════════════════
-- Chat translation, update frequency and meds (daily updates improvements)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Chat translation: messages.message_lang / translated_body /
--    translated_lang / translated_at, written only by the chat-translate edge
--    function (service role; members still can't UPDATE messages). They live
--    on the message row, so they're deleted with it, exported with it and
--    follow it on account deletion.
--    queue_chat_translation (AFTER INSERT on messages) does cheap checks and
--    queues chat-translate through request_internal_function (Vault secret).
--    It never blocks or fails the send. It queues nothing for special cards,
--    guide questions, removed photos, chats with a former member, recipients
--    without a preferred language, near-empty text, or when the flag is off
--    and the sender isn't an admin.
--    app_settings.chat_translate_enabled = false.
-- 2. sit_update_due(sit): the owner's update frequency as one rule, shared by
--    the 6pm reminder and the sit page (listings.communication_style):
--      daily (or not set)  every sit day
--      every_few_days      day 1, then 3 days after the last update
--      weekly              day 1, then 7 days after the last update
--      as_needed           never
--    For every_few_days and weekly the sit's last day is also due (a closing
--    update). Days are the home's local days; "last update" is the latest day
--    the sitter sent any update.
-- 3. update_reminders_due(): the sits whose sitter gets the 6pm reminder now.
-- 4. get_sit_update_context adds "schedule" (sit_update_due).
--
-- SECRETS: none here.


-- ─── 1. Chat translation ───────────────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_lang text,
  ADD COLUMN IF NOT EXISTS translated_body text,
  ADD COLUMN IF NOT EXISTS translated_lang text,
  ADD COLUMN IF NOT EXISTS translated_at timestamptz;

INSERT INTO public.app_settings (key, value)
VALUES ('chat_translate_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.queue_chat_translation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  v_recipient uuid;
  v_lang text;
  v_flag boolean;
  v_admin boolean;
  v_text text := btrim(COALESCE(NEW.body, ''));
BEGIN
  -- Special cards and anything with no real words: no translation.
  IF NEW.sender_user_id IS NULL
     OR NEW.guide_question_id IS NOT NULL
     OR left(v_text, 9) = '[[image]]'
     OR left(v_text, 11) = '[[checkin]]'
     OR left(v_text, 15) = '[Photo removed]'
     OR char_length(v_text) < 3
     OR v_text ~ '^[[:space:][:punct:][:digit:]]*$' THEN
    RETURN NULL;
  END IF;

  SELECT owner_user_id, sitter_user_id INTO c FROM public.conversations WHERE id = NEW.conversation_id;
  IF c.owner_user_id IS NULL OR c.sitter_user_id IS NULL THEN
    RETURN NULL; -- a former member's chat
  END IF;
  v_recipient := CASE WHEN c.owner_user_id = NEW.sender_user_id THEN c.sitter_user_id ELSE c.owner_user_id END;

  SELECT preferred_language INTO v_lang FROM public.profiles WHERE id = v_recipient;
  IF v_lang IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT (value = 'true'::jsonb) INTO v_flag FROM public.app_settings WHERE key = 'chat_translate_enabled';
  IF NOT COALESCE(v_flag, false) THEN
    SELECT is_admin INTO v_admin FROM public.profiles WHERE id = NEW.sender_user_id;
    IF NOT COALESCE(v_admin, false) THEN
      RETURN NULL;
    END IF;
  END IF;

  PERFORM public.request_internal_function('chat-translate', jsonb_build_object('message_id', NEW.id));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never block or fail sending a message.
  RAISE WARNING 'queue_chat_translation skipped for message %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_chat_translation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_chat_translation ON public.messages;
CREATE TRIGGER queue_chat_translation
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.queue_chat_translation();


-- ─── 2. The owner's update frequency: when is an update due? ───────────────

CREATE OR REPLACE FUNCTION public.sit_update_due(p_sit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  v_style text;
  v_interval integer;
  v_tz text;
  v_today date;
  v_last date;
  v_base date;
  v_next date;
BEGIN
  SELECT si.id, si.listing_id,
         COALESCE(sd.start_date, si.snapshot_start_date) AS start_date,
         COALESCE(sd.end_date, si.snapshot_end_date) AS end_date,
         l.communication_style
  INTO s
  FROM public.sits si
  LEFT JOIN public.sit_dates sd ON sd.id = si.sit_dates_id
  LEFT JOIN public.listings l ON l.id = si.listing_id
  WHERE si.id = p_sit_id;
  IF NOT FOUND OR s.start_date IS NULL OR s.end_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_style := CASE WHEN s.communication_style IN ('daily', 'every_few_days', 'weekly', 'as_needed')
                  THEN s.communication_style ELSE 'daily' END;
  v_interval := CASE v_style WHEN 'daily' THEN 1 WHEN 'every_few_days' THEN 3 WHEN 'weekly' THEN 7 END;
  v_tz := COALESCE(CASE WHEN s.listing_id IS NOT NULL THEN public.listing_timezone(s.listing_id) END, 'UTC');
  v_today := (now() AT TIME ZONE v_tz)::date;
  SELECT max(local_day) INTO v_last FROM public.sit_checkins WHERE sit_id = p_sit_id;

  IF v_interval IS NOT NULL THEN
    v_base := CASE WHEN v_last IS NULL THEN s.start_date ELSE v_last + v_interval END;
    v_next := GREATEST(v_base, s.start_date);
    -- every_few_days / weekly: the last day is also due (a closing update).
    IF v_interval > 1 AND v_next > s.end_date AND (v_last IS NULL OR v_last < s.end_date) THEN
      v_next := s.end_date;
    END IF;
    IF v_next > s.end_date THEN
      v_next := NULL; -- nothing more due this sit
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'style', v_style,
    'interval_days', v_interval,
    'today', v_today,
    'last_update_day', v_last,
    'sent_today', v_last IS NOT DISTINCT FROM v_today,
    'next_due', v_next,
    'next_due_is_last_day', COALESCE(v_interval, 0) > 1 AND v_next IS NOT NULL AND v_next = s.end_date,
    'due_today', v_next IS NOT NULL AND v_today >= v_next
                 AND v_today BETWEEN s.start_date AND s.end_date
                 AND v_last IS DISTINCT FROM v_today
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sit_update_due(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sit_update_due(uuid) TO service_role;


-- ─── 3. Sits whose sitter gets the 6pm reminder now ────────────────────────

CREATE OR REPLACE FUNCTION public.update_reminders_due()
RETURNS TABLE (sit_id uuid, sitter_user_id uuid, owner_first_name text, listing_title text, style text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT si.id, si.sitter_user_id,
         COALESCE(NULLIF(TRIM(p.first_name), ''), 'Your Pet Parent'),
         COALESCE(l.title, si.snapshot_title, 'your sit'),
         d->>'style'
  FROM public.sits si
  JOIN public.listings l ON l.id = si.listing_id
  LEFT JOIN public.profiles p ON p.id = si.owner_user_id
  CROSS JOIN LATERAL (SELECT public.sit_update_due(si.id) AS d) due
  WHERE si.status = 'in_progress'
    AND si.sitter_user_id IS NOT NULL
    AND si.owner_user_id IS NOT NULL
    AND extract(hour FROM now() AT TIME ZONE public.listing_timezone(si.listing_id)) = 18
    AND (d->>'due_today')::boolean
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = si.sitter_user_id
        AND n.type = 'sit_checkin_reminder'
        AND n.data->>'sit_id' = si.id::text
        AND n.created_at > now() - interval '20 hours'
    );
$function$;

REVOKE ALL ON FUNCTION public.update_reminders_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_reminders_due() TO service_role;


-- ─── 4. Sit page context: + schedule ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_sit_update_context(p_sit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  s record;
  v_tz text;
  v_today date;
  v_start date;
  v_end date;
  v_other_left boolean;
BEGIN
  SELECT si.id, si.status, si.owner_user_id, si.sitter_user_id, si.listing_id,
         COALESCE(sd.start_date, si.snapshot_start_date) AS start_date,
         COALESCE(sd.end_date, si.snapshot_end_date) AS end_date,
         COALESCE(l.title, si.snapshot_title) AS title
  INTO s
  FROM public.sits si
  LEFT JOIN public.sit_dates sd ON sd.id = si.sit_dates_id
  LEFT JOIN public.listings l ON l.id = si.listing_id
  WHERE si.id = p_sit_id;

  IF NOT FOUND OR v_uid IS NULL
     OR NOT (v_uid = s.owner_user_id OR v_uid = s.sitter_user_id)
     OR s.start_date IS NULL OR s.end_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_tz := COALESCE(CASE WHEN s.listing_id IS NOT NULL THEN public.listing_timezone(s.listing_id) END, 'UTC');
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_start := s.start_date;
  v_end := s.end_date;
  v_other_left := s.owner_user_id IS NULL OR s.sitter_user_id IS NULL;

  RETURN jsonb_build_object(
    'sit_id', s.id,
    'status', s.status,
    'role', CASE WHEN v_uid = s.sitter_user_id THEN 'sitter' ELSE 'owner' END,
    'listing_id', s.listing_id,
    'listing_title', COALESCE(s.title, 'your sit'),
    'owner_user_id', s.owner_user_id,
    'sitter_user_id', s.sitter_user_id,
    'other_member_left', v_other_left,
    'schedule', public.sit_update_due(s.id),
    'timezone', v_tz,
    'today', v_today,
    'start_date', v_start,
    'end_date', v_end,
    'total_days', (v_end - v_start) + 1,
    'day_number', CASE WHEN v_today BETWEEN v_start AND v_end THEN (v_today - v_start) + 1 END,
    'can_post', v_uid = s.sitter_user_id AND s.status IN ('confirmed', 'in_progress') AND NOT v_other_left,
    'owner', CASE WHEN s.owner_user_id IS NULL
                  THEN jsonb_build_object('first_name', 'Former member', 'avatar_url', NULL)
                  ELSE (SELECT jsonb_build_object('first_name', COALESCE(NULLIF(TRIM(p.first_name), ''), 'your Pet Parent'), 'avatar_url', p.avatar_url)
                        FROM public.profiles p WHERE p.id = s.owner_user_id) END,
    'sitter', CASE WHEN s.sitter_user_id IS NULL
                   THEN jsonb_build_object('first_name', 'Former member', 'avatar_url', NULL)
                   ELSE (SELECT jsonb_build_object('first_name', COALESCE(NULLIF(TRIM(p.first_name), ''), 'your Nomad'), 'avatar_url', p.avatar_url)
                         FROM public.profiles p WHERE p.id = s.sitter_user_id) END,
    'pets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', pt.name,
        'type', pt.type,
        'photo', pt.photos[1],
        'needs_medication', COALESCE(pt.requires_medication, false) OR COALESCE(pt.has_medication, false)
      ) ORDER BY pt.created_at)
      FROM public.pets pt WHERE s.listing_id IS NOT NULL AND pt.listing_id = s.listing_id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sit_update_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sit_update_context(uuid) TO authenticated;
