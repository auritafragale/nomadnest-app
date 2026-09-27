-- ═══════════════════════════════════════════════════════════════════════════
-- Daily updates (check-in redesign) + AI Daily Updates
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. profiles.preferred_language (+ set_my_preferred_language RPC): the
--    language an owner reads sitter updates in. Filled once from the browser
--    when empty, editable in Settings.
-- 2. sit_checkins becomes "today's update": kind 'daily_update' with chips,
--    up to 4 private photo paths, an optional flag note, the home's local day,
--    translation fields and the owner's heart. One row per update, so the
--    existing notification trigger, reminder cron and email check keep working.
-- 3. guard_sit_checkin_write (SECURITY INVOKER, app writes only): new rows must
--    be daily updates with valid chips and photo paths inside the sit's folder;
--    photo_url (public URLs) can no longer be written; translation and heart
--    fields are server-only. set_sit_checkin_local_day stamps the local day.
-- 4. Private bucket sit-update-photos ({sit_id}/{file}). Upload: the sit's
--    sitter while it's confirmed or in progress. Read: the sit's sitter and
--    owner. Check-in photos can never be uploaded to listing-images again.
-- 5. toggle_checkin_heart (owner) + a quiet 'sit_update_loved' notification
--    for the sitter, once per update. The push trigger skips that type.
-- 6. notify_owner_on_sit_checkin: calm copy for daily updates.
-- 7. get_sit_update_context: the progress header (Day 3 of 7, pets, names).
-- 8. app_settings.daily_update_ai_enabled = false.
--
-- SECRETS: none here. The push trigger reads internal_trigger_secret from Vault.


-- ─── 1. Preferred language ─────────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_language text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_preferred_language_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_preferred_language_check
  CHECK (preferred_language IS NULL OR preferred_language IN
    ('en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'nb', 'pl', 'el'));

-- p_only_if_empty: the first-sign-in autofill never overwrites a choice.
CREATE OR REPLACE FUNCTION public.set_my_preferred_language(p_language text, p_only_if_empty boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lang text := lower(NULLIF(TRIM(p_language), ''));
  v_current text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;
  IF v_lang IS NOT NULL AND v_lang NOT IN ('en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'nb', 'pl', 'el') THEN
    IF p_only_if_empty THEN
      RETURN NULL; -- unsupported browser language: leave it unset
    END IF;
    RAISE EXCEPTION 'That language isn''t supported yet.';
  END IF;

  SELECT preferred_language INTO v_current FROM public.profiles WHERE id = v_uid;
  IF p_only_if_empty AND v_current IS NOT NULL THEN
    RETURN v_current;
  END IF;

  UPDATE public.profiles SET preferred_language = v_lang WHERE id = v_uid;
  RETURN v_lang;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_my_preferred_language(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_preferred_language(text, boolean) TO authenticated;


-- ─── 2. sit_checkins: today's update ───────────────────────────────────────

ALTER TABLE public.sit_checkins
  ADD COLUMN IF NOT EXISTS chips text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_note text,
  ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS local_day date,
  ADD COLUMN IF NOT EXISTS ai_drafted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS message_lang text,
  ADD COLUMN IF NOT EXISTS translated_message text,
  ADD COLUMN IF NOT EXISTS translated_flag_note text,
  ADD COLUMN IF NOT EXISTS translated_lang text,
  ADD COLUMN IF NOT EXISTS translated_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_heart_at timestamptz;

ALTER TABLE public.sit_checkins DROP CONSTRAINT IF EXISTS sit_checkins_kind_check;
ALTER TABLE public.sit_checkins ADD CONSTRAINT sit_checkins_kind_check
  CHECK (kind IN ('pets_fed', 'meds_given', 'walk_completed', 'note', 'daily_update'));

CREATE INDEX IF NOT EXISTS sit_checkins_sit_created_idx ON public.sit_checkins (sit_id, created_at DESC);

-- Existing rows: their local day in the home's time zone.
UPDATE public.sit_checkins c
SET local_day = (c.created_at AT TIME ZONE public.listing_timezone(s.listing_id))::date
FROM public.sits s
WHERE s.id = c.sit_id AND c.local_day IS NULL;

-- The home's local day, for every writer (definer: reads the listing).
CREATE OR REPLACE FUNCTION public.set_sit_checkin_local_day()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  SELECT (COALESCE(NEW.created_at, now()) AT TIME ZONE public.listing_timezone(s.listing_id))::date
  INTO NEW.local_day
  FROM public.sits s WHERE s.id = NEW.sit_id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_sit_checkin_local_day() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_sit_checkin_local_day ON public.sit_checkins;
CREATE TRIGGER set_sit_checkin_local_day
BEFORE INSERT ON public.sit_checkins
FOR EACH ROW EXECUTE FUNCTION public.set_sit_checkin_local_day();


-- ─── 3. Guard for app writes ───────────────────────────────────────────────
-- Members have INSERT (policy: own sit, confirmed or in progress) but no
-- UPDATE or DELETE on sit_checkins; translation and the heart are written by
-- the daily-update-ai function (service role) and toggle_checkin_heart.

CREATE OR REPLACE FUNCTION public.guard_sit_checkin_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_path text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Updates can''t be changed after sending.' USING ERRCODE = '42501';
  END IF;

  IF NEW.kind <> 'daily_update' THEN
    RAISE EXCEPTION 'Please send today''s update from the sit page.' USING ERRCODE = '42501';
  END IF;

  -- Public photo URLs are never accepted again: photos go to the private bucket.
  IF NEW.photo_url IS NOT NULL THEN
    RAISE EXCEPTION 'Photos must be added to today''s update.' USING ERRCODE = '42501';
  END IF;

  IF NOT (NEW.chips <@ ARRAY['fed', 'walked', 'meds', 'play', 'litter_garden', 'all_good', 'flag']::text[]) THEN
    RAISE EXCEPTION 'Unknown update option.';
  END IF;
  IF 'all_good' = ANY (NEW.chips) AND 'flag' = ANY (NEW.chips) THEN
    RAISE EXCEPTION 'Choose either "All good" or "Something to flag".';
  END IF;
  NEW.flagged := 'flag' = ANY (NEW.chips);
  IF NOT NEW.flagged THEN
    NEW.flag_note := NULL;
  END IF;

  IF cardinality(NEW.photo_paths) > 4 THEN
    RAISE EXCEPTION 'Please add up to 4 photos.';
  END IF;
  FOREACH v_path IN ARRAY NEW.photo_paths LOOP
    IF v_path !~ ('^' || NEW.sit_id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') THEN
      RAISE EXCEPTION 'Invalid photo.' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF char_length(COALESCE(NEW.note, '')) > 1000 OR char_length(COALESCE(NEW.flag_note, '')) > 500 THEN
    RAISE EXCEPTION 'Please keep your update shorter.';
  END IF;
  IF cardinality(NEW.chips) = 0 AND cardinality(NEW.photo_paths) = 0 AND NULLIF(TRIM(COALESCE(NEW.note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Add a photo, a tap or a message first.';
  END IF;

  -- Server-only fields.
  NEW.message_lang := NULL;
  NEW.translated_message := NULL;
  NEW.translated_flag_note := NULL;
  NEW.translated_lang := NULL;
  NEW.translated_at := NULL;
  NEW.owner_heart_at := NULL;
  NEW.created_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_sit_checkin_write ON public.sit_checkins;
CREATE TRIGGER guard_sit_checkin_write
BEFORE INSERT OR UPDATE ON public.sit_checkins
FOR EACH ROW EXECUTE FUNCTION public.guard_sit_checkin_write();
-- Trigger order: guard_sit_checkin_write runs before set_sit_checkin_local_day
-- (alphabetical), so the local day uses the created_at the guard fixed.


-- ─── 4. Private photo bucket ───────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sit-update-photos', 'sit-update-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The sit id is the first folder of the object name.
CREATE OR REPLACE FUNCTION public.sit_update_photo_sit(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN split_part(p_name, '/', 1)::uuid
  END;
$function$;

CREATE OR REPLACE FUNCTION public.can_upload_sit_update_photo(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sits s
    WHERE s.id = public.sit_update_photo_sit(p_name)
      AND s.sitter_user_id = auth.uid()
      AND s.status IN ('confirmed', 'in_progress')
  )
  AND p_name ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$';
$function$;

CREATE OR REPLACE FUNCTION public.can_read_sit_update_photo(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sits s
    WHERE s.id = public.sit_update_photo_sit(p_name)
      AND (s.sitter_user_id = auth.uid() OR s.owner_user_id = auth.uid())
  );
$function$;

REVOKE ALL ON FUNCTION public.can_upload_sit_update_photo(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_sit_update_photo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_sit_update_photo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_sit_update_photo(text) TO authenticated;

DROP POLICY IF EXISTS "Sitters upload daily update photos" ON storage.objects;
CREATE POLICY "Sitters upload daily update photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'sit-update-photos' AND public.can_upload_sit_update_photo(name));

DROP POLICY IF EXISTS "Sit participants read daily update photos" ON storage.objects;
CREATE POLICY "Sit participants read daily update photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'sit-update-photos' AND public.can_read_sit_update_photo(name));

-- A sitter can remove a photo they added (before sending).
DROP POLICY IF EXISTS "Sitters delete their own daily update photos" ON storage.objects;
CREATE POLICY "Sitters delete their own daily update photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'sit-update-photos' AND owner_id = auth.uid()::text AND public.can_upload_sit_update_photo(name));

-- Never again: no check-ins folder in the public listing-images bucket.
DROP POLICY IF EXISTS "No check-in photos in listing-images" ON storage.objects;
CREATE POLICY "No check-in photos in listing-images"
ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (bucket_id <> 'listing-images' OR name !~* '(^|/)check-?ins?(/|$)');

DROP POLICY IF EXISTS "No check-in photos moved into listing-images" ON storage.objects;
CREATE POLICY "No check-in photos moved into listing-images"
ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
WITH CHECK (bucket_id <> 'listing-images' OR name !~* '(^|/)check-?ins?(/|$)');


-- ─── 5. Heart (owner) + quiet notification for the sitter ──────────────────

CREATE OR REPLACE FUNCTION public.toggle_checkin_heart(p_checkin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  v_owner_first text;
  v_hearted boolean;
BEGIN
  SELECT sc.id, sc.sit_id, sc.owner_heart_at, s.owner_user_id, s.sitter_user_id, COALESCE(l.title, 'your sit') AS title
  INTO c
  FROM public.sit_checkins sc
  JOIN public.sits s ON s.id = sc.sit_id
  LEFT JOIN public.listings l ON l.id = s.listing_id
  WHERE sc.id = p_checkin_id
  FOR UPDATE OF sc;

  IF NOT FOUND OR c.owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Update not found.' USING ERRCODE = '42501';
  END IF;

  v_hearted := c.owner_heart_at IS NULL;
  UPDATE public.sit_checkins
  SET owner_heart_at = CASE WHEN v_hearted THEN now() ELSE NULL END
  WHERE id = c.id;

  -- Once per update, even if the heart is toggled again.
  IF v_hearted AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = c.sitter_user_id
      AND n.type = 'sit_update_loved'
      AND n.data->>'checkin_id' = c.id::text
  ) THEN
    SELECT COALESCE(NULLIF(TRIM(first_name), ''), 'Your Pet Parent') INTO v_owner_first
    FROM public.profiles WHERE id = c.owner_user_id;
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      c.sitter_user_id,
      'sit_update_loved',
      COALESCE(v_owner_first, 'Your Pet Parent') || ' loved today''s update',
      c.title,
      jsonb_build_object('url', '/sits/' || c.sit_id::text, 'sit_id', c.sit_id::text, 'checkin_id', c.id::text)
    );
  END IF;

  RETURN jsonb_build_object('hearted', v_hearted, 'sit_id', c.sit_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.toggle_checkin_heart(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_checkin_heart(uuid) TO authenticated;

-- Central push trigger: unchanged, except quiet types never push.
CREATE OR REPLACE FUNCTION public.push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  -- Quiet, in-app only notifications.
  IF NEW.type IN ('sit_update_loved') THEN
    RETURN NEW;
  END IF;

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


-- ─── 6. Owner notification copy ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_owner_on_sit_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_sitter uuid;
  v_title text;
  v_label text;
  v_sitter_first text;
  v_message text;
BEGIN
  SELECT s.owner_user_id, s.sitter_user_id, COALESCE(l.title, 'your sit')
    INTO v_owner, v_sitter, v_title
  FROM public.sits s
  LEFT JOIN public.listings l ON l.id = s.listing_id
  WHERE s.id = NEW.sit_id;

  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.kind = 'daily_update' THEN
    SELECT COALESCE(NULLIF(TRIM(first_name), ''), 'Your Nomad') INTO v_sitter_first
    FROM public.profiles WHERE id = v_sitter;
    v_sitter_first := COALESCE(v_sitter_first, 'Your Nomad');
    IF NEW.flagged THEN
      v_label := 'Today''s update, with a note for you';
      v_message := COALESCE(NULLIF(TRIM(NEW.flag_note), ''), NULLIF(TRIM(NEW.note), ''),
                            v_sitter_first || ' shared today''s update.');
    ELSE
      v_label := 'Today''s update from ' || v_sitter_first;
      v_message := COALESCE(NULLIF(TRIM(NEW.note), ''),
                            CASE WHEN cardinality(NEW.photo_paths) > 0
                                 THEN v_sitter_first || ' shared new photos.'
                                 ELSE v_sitter_first || ' shared today''s update.' END);
    END IF;
    v_message := left(v_message, 200);
  ELSE
    v_label := CASE NEW.kind
      WHEN 'pets_fed' THEN 'Pets Fed'
      WHEN 'meds_given' THEN 'Meds Given'
      WHEN 'walk_completed' THEN 'Walk Completed'
      ELSE 'Check-in'
    END;
    v_message := COALESCE(NULLIF(NEW.note, ''), 'Your Nomad posted a "' || v_label || '" update.');
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    v_owner,
    'sit_checkin',
    v_label || '. ' || v_title,
    v_message,
    jsonb_build_object('url', '/sits/' || NEW.sit_id::text, 'sit_id', NEW.sit_id)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_owner_on_sit_checkin() FROM PUBLIC, anon, authenticated;


-- ─── 7. Progress header context ────────────────────────────────────────────

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
BEGIN
  SELECT si.id, si.status, si.owner_user_id, si.sitter_user_id, si.listing_id,
         sd.start_date, sd.end_date, l.title
  INTO s
  FROM public.sits si
  JOIN public.sit_dates sd ON sd.id = si.sit_dates_id
  LEFT JOIN public.listings l ON l.id = si.listing_id
  WHERE si.id = p_sit_id;

  IF NOT FOUND OR v_uid IS NULL OR (v_uid <> s.owner_user_id AND v_uid <> s.sitter_user_id) THEN
    RETURN NULL;
  END IF;

  v_tz := public.listing_timezone(s.listing_id);
  v_today := (now() AT TIME ZONE v_tz)::date;

  RETURN jsonb_build_object(
    'sit_id', s.id,
    'status', s.status,
    'role', CASE WHEN v_uid = s.sitter_user_id THEN 'sitter' ELSE 'owner' END,
    'listing_id', s.listing_id,
    'listing_title', COALESCE(s.title, 'your sit'),
    'owner_user_id', s.owner_user_id,
    'sitter_user_id', s.sitter_user_id,
    'timezone', v_tz,
    'today', v_today,
    'start_date', s.start_date,
    'end_date', s.end_date,
    'total_days', (s.end_date - s.start_date) + 1,
    'day_number', CASE WHEN v_today BETWEEN s.start_date AND s.end_date THEN (v_today - s.start_date) + 1 END,
    'can_post', v_uid = s.sitter_user_id AND s.status IN ('confirmed', 'in_progress'),
    'owner', (SELECT jsonb_build_object('first_name', COALESCE(NULLIF(TRIM(p.first_name), ''), 'your Pet Parent'), 'avatar_url', p.avatar_url)
              FROM public.profiles p WHERE p.id = s.owner_user_id),
    'sitter', (SELECT jsonb_build_object('first_name', COALESCE(NULLIF(TRIM(p.first_name), ''), 'your Nomad'), 'avatar_url', p.avatar_url)
               FROM public.profiles p WHERE p.id = s.sitter_user_id),
    'pets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', pt.name,
        'type', pt.type,
        'photo', pt.photos[1],
        'needs_medication', COALESCE(pt.requires_medication, false) OR COALESCE(pt.has_medication, false)
      ) ORDER BY pt.created_at)
      FROM public.pets pt WHERE pt.listing_id = s.listing_id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sit_update_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sit_update_context(uuid) TO authenticated;


-- daily-update-ai (service role) checks "today" in the home's time zone.
GRANT EXECUTE ON FUNCTION public.listing_timezone(uuid) TO service_role;


-- ─── 8. Feature flag ───────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value)
VALUES ('daily_update_ai_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
