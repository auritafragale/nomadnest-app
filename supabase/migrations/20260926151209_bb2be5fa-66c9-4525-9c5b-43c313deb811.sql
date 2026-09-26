-- lovable-cron-fallback-reviewed: unlock notifications are time-based (48h-before-start window), not row-change driven; idempotent per sit+date range, so every-5-min polling is the correct pattern.
-- ═══════════════════════════════════════════════════════════════════════════
-- Sit Companion, Stage 2: sitter access windows for the Welcome Guide
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ACCESS (enforced here, served only through SECURITY DEFINER functions):
--   * From confirmation until the END of the sit's end date (listing time
--     zone): house and everyday living, vet and emergency, full pet care
--     (incl. vet_info, medication_instructions, behaviour_notes), the exact
--     address, and photos for those sections.
--   * Arrival and access (keys, codes, alarm, Wi-Fi, access photos): only from
--     48 hours before 00:00 on the start date until the end of the end date.
--   * Cancelled sits: nothing, immediately. After the end date: nothing (no
--     grace period).
--   Times use listings.timezone when it's a valid zone, otherwise UTC.
--
-- Also: sitter table policy on welcome_guides removed (function only), the
-- unlock notifications + owner nudge (every 5 minutes, idempotent), a guard
-- against editing dates that are in use, and listings.timezone derived from
-- the home's coordinates (listing-timezone edge function).
--
-- SECRETS: read from Vault only. Never put a secret value in a migration.


-- ─── 1. Time zone and access window helpers ────────────────────────────────

CREATE OR REPLACE FUNCTION public.listing_timezone(p_listing_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
BEGIN
  SELECT NULLIF(TRIM(timezone), '') INTO v_tz FROM public.listings WHERE id = p_listing_id;
  IF v_tz IS NULL THEN
    RETURN 'UTC';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;   -- invalid zone names raise here
    RETURN v_tz;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'UTC';
  END;
END;
$function$;

-- unlock_at: 48h before 00:00 on the start date; ends_at: end of the end date.
CREATE OR REPLACE FUNCTION public.sit_guide_window(p_sit_id uuid)
RETURNS TABLE (unlock_at timestamptz, ends_at timestamptz, timezone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (sd.start_date::timestamp AT TIME ZONE tz.name) - interval '48 hours',
    ((sd.end_date + 1)::timestamp AT TIME ZONE tz.name),
    tz.name
  FROM public.sits s
  JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
  CROSS JOIN LATERAL (SELECT public.listing_timezone(s.listing_id) AS name) tz
  WHERE s.id = p_sit_id;
$function$;

-- The caller's sit on a listing that currently grants guide access (if any):
-- confirmed / in progress / completed, and the end date hasn't finished yet.
CREATE OR REPLACE FUNCTION public.sitter_guide_sit(p_listing_id uuid, p_user_id uuid)
RETURNS TABLE (sit_id uuid, sit_dates_id uuid, unlock_at timestamptz, ends_at timestamptz, timezone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.sit_dates_id, w.unlock_at, w.ends_at, w.timezone
  FROM public.sits s
  CROSS JOIN LATERAL public.sit_guide_window(s.id) w
  WHERE s.listing_id = p_listing_id
    AND s.sitter_user_id = p_user_id
    AND s.status IN ('confirmed', 'in_progress', 'completed')
    AND now() < w.ends_at
  ORDER BY w.ends_at
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.listing_timezone(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sit_guide_window(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sitter_guide_sit(uuid, uuid) FROM PUBLIC, anon, authenticated;


-- ─── 2. The sitter's guide ─────────────────────────────────────────────────
-- Returns NULL when the caller has no sit granting access right now.
-- Section d ("access") and access photos only while the window is open.

CREATE OR REPLACE FUNCTION public.get_sitter_guide(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  w record;
  v_open boolean;
  l record;
  g record;
  a record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO w FROM public.sitter_guide_sit(p_listing_id, v_uid);
  IF w.sit_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_open := now() >= w.unlock_at AND now() < w.ends_at;

  SELECT id, title, address_private INTO l FROM public.listings WHERE id = p_listing_id;
  SELECT * INTO g FROM public.welcome_guides WHERE listing_id = p_listing_id;
  SELECT * INTO a FROM public.welcome_guide_access WHERE listing_id = p_listing_id;

  RETURN jsonb_build_object(
    'listing_id', l.id,
    'listing_title', l.title,
    'address', l.address_private,
    'sit_id', w.sit_id,
    'timezone', w.timezone,
    'unlock_at', w.unlock_at,
    'ends_at', w.ends_at,
    'access_open', v_open,
    'guide', CASE WHEN g.listing_id IS NULL THEN NULL ELSE jsonb_build_object(
      'emergency_contacts', g.emergency_contacts,
      'out_of_hours_vet', g.out_of_hours_vet,
      'house_notes', g.house_notes,
      'bins_recycling', g.bins_recycling,
      'plants', g.plants,
      'appliances', g.appliances,
      'heating_cooling', g.heating_cooling,
      'parking', g.parking,
      'neighbours', g.neighbours,
      'na_fields', to_jsonb(COALESCE(g.na_fields, '{}'::text[])),
      'updated_at', g.updated_at
    ) END,
    'access', CASE WHEN v_open AND a.listing_id IS NOT NULL THEN jsonb_build_object(
      'key_handover', a.key_handover,
      'door_codes', a.door_codes,
      'alarm_instructions', a.alarm_instructions,
      'wifi_details', a.wifi_details,
      'na_fields', to_jsonb(COALESCE(a.na_fields, '{}'::text[]))
    ) ELSE NULL END,
    'pets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'type', p.type,
        'age', p.age,
        'personality', p.personality,
        'feedingDetails', p.feeding_details,
        'walks_exercise', p.walks_exercise,
        'daily_routine', p.daily_routine,
        'requires_medication', p.requires_medication,
        'has_medication', p.has_medication,
        'medication_instructions', p.medication_instructions,
        'behaviour_notes', p.behaviour_notes,
        'vet_info', p.vet_info
      ) ORDER BY p.created_at)
      FROM public.pets p WHERE p.listing_id = p_listing_id
    ), '[]'::jsonb),
    'photos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'section', ph.section,
        'pet_id', ph.pet_id,
        'note', ph.note,
        'instruction', ph.instruction,
        'storage_path', ph.storage_path
      ) ORDER BY ph.sort_order, ph.created_at)
      FROM public.welcome_guide_photos ph
      WHERE ph.listing_id = p_listing_id
        AND (ph.section <> 'access' OR v_open)
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sitter_guide(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sitter_guide(uuid) TO authenticated;


-- ─── 3. Light status for the sitter's sit cards ────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_guide_windows()
RETURNS TABLE (
  sit_id uuid,
  listing_id uuid,
  unlock_at timestamptz,
  ends_at timestamptz,
  timezone text,
  access_open boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.listing_id, w.unlock_at, w.ends_at, w.timezone,
         now() >= w.unlock_at AND now() < w.ends_at
  FROM public.sits s
  CROSS JOIN LATERAL public.sit_guide_window(s.id) w
  WHERE s.sitter_user_id = auth.uid()
    AND s.status IN ('confirmed', 'in_progress', 'completed')
    AND now() < w.ends_at;
$function$;

REVOKE ALL ON FUNCTION public.get_my_guide_windows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_guide_windows() TO authenticated;


-- ─── 4. Exact address: owner, or the sitter from confirmation to end date ──

CREATE OR REPLACE FUNCTION public.get_listing_private_address(p_listing_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_address TEXT;
BEGIN
  SELECT l.address_private INTO v_address
  FROM public.listings l
  WHERE l.id = p_listing_id
    AND (
      l.owner_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.sitter_guide_sit(p_listing_id, auth.uid()))
    );
  RETURN v_address; -- NULL if not allowed
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_listing_private_address(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_private_address(UUID) TO authenticated;


-- ─── 5. Sitters read the guide only through get_sitter_guide ───────────────

DROP POLICY IF EXISTS "Confirmed nomads can read the welcome guide" ON public.welcome_guides;


-- ─── 6. Unlock notifications (sitter) and missing-details nudge (owner) ────

CREATE TABLE IF NOT EXISTS public.guide_unlock_notifications (
  sit_id uuid NOT NULL REFERENCES public.sits(id) ON DELETE CASCADE,
  sit_dates_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sitter_ready', 'owner_missing')),
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sit_id, sit_dates_id, kind)
);
ALTER TABLE public.guide_unlock_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guide_unlock_notifications FROM anon, authenticated;
GRANT ALL ON public.guide_unlock_notifications TO service_role;

-- Every open window: if Keys and handover is filled in, tell the sitter once;
-- if it's still empty, tell the owner once (and the sitter once it's added).
-- Keyed by sit + date range, so a rescheduled sit is notified for its new window.
CREATE OR REPLACE FUNCTION public.notify_guide_unlocks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_sent integer := 0;
  v_sitter_first text;
BEGIN
  FOR r IN
    SELECT s.id AS sit_id, s.sit_dates_id, s.listing_id, s.owner_user_id, s.sitter_user_id,
           l.title AS listing_title,
           COALESCE(TRIM(acc.key_handover), '') <> '' AS has_key
    FROM public.sits s
    JOIN public.listings l ON l.id = s.listing_id
    CROSS JOIN LATERAL public.sit_guide_window(s.id) w
    LEFT JOIN public.welcome_guide_access acc ON acc.listing_id = s.listing_id
    WHERE s.status IN ('confirmed', 'in_progress')
      AND now() >= w.unlock_at
      AND now() < w.ends_at
  LOOP
    BEGIN
      IF r.has_key THEN
        INSERT INTO public.guide_unlock_notifications (sit_id, sit_dates_id, kind)
        VALUES (r.sit_id, r.sit_dates_id, 'sitter_ready')
        ON CONFLICT DO NOTHING;
        IF FOUND THEN
          INSERT INTO public.notifications (user_id, type, title, message, data)
          VALUES (
            r.sitter_user_id,
            'guide_unlocked',
            'Your arrival details are ready',
            'Everything you need to get into ' || COALESCE(r.listing_title, 'the home') || ' is now in your Welcome Guide.',
            jsonb_build_object('url', '/listing/' || r.listing_id::text || '/welcome-guide',
                               'listing_id', r.listing_id::text, 'sit_id', r.sit_id::text)
          );
          v_sent := v_sent + 1;
        END IF;
      ELSE
        INSERT INTO public.guide_unlock_notifications (sit_id, sit_dates_id, kind)
        VALUES (r.sit_id, r.sit_dates_id, 'owner_missing')
        ON CONFLICT DO NOTHING;
        IF FOUND THEN
          SELECT COALESCE(NULLIF(TRIM(first_name), ''), 'Your sitter') INTO v_sitter_first
          FROM public.profiles WHERE id = r.sitter_user_id;
          v_sitter_first := COALESCE(v_sitter_first, 'Your sitter');
          INSERT INTO public.notifications (user_id, type, title, message, data)
          VALUES (
            r.owner_user_id,
            'guide_access_missing',
            v_sitter_first || ' arrives soon',
            'Add your arrival details so ' || v_sitter_first
              || ' can get in. They unlock for your sitter as soon as you save them.',
            jsonb_build_object('url', '/listing/' || r.listing_id::text || '/welcome-guide?section=access',
                               'listing_id', r.listing_id::text, 'sit_id', r.sit_id::text)
          );
          v_sent := v_sent + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Guide unlock notification failed for sit %: %', r.sit_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_sent;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_guide_unlocks() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'guide-unlock-notify';
SELECT cron.schedule('guide-unlock-notify', '*/5 * * * *', $$SELECT public.notify_guide_unlocks();$$);


-- ─── 7. Dates in use can't be edited directly ──────────────────────────────
-- App writes only (SECURITY INVOKER + current_user check, like the other
-- guards): accept_application and respond_to_sit_reschedule are unaffected.

CREATE OR REPLACE FUNCTION public.guard_sit_dates_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_active boolean;
  v_used boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.sits
    WHERE sit_dates_id = OLD.id AND status IN ('confirmed', 'in_progress')
  ) INTO v_active;
  v_used := v_active OR EXISTS (
    SELECT 1 FROM public.sits WHERE sit_dates_id = OLD.id AND status = 'completed'
  );

  IF TG_OP = 'DELETE' THEN
    IF v_active THEN
      RAISE EXCEPTION 'These dates belong to a confirmed sit and can''t be deleted.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF v_used AND (
       NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
  ) THEN
    RAISE EXCEPTION 'These dates are booked. To change them, propose new dates from the sit.' USING ERRCODE = '42501';
  END IF;

  IF v_active AND OLD.status = 'booked' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'These dates are booked for a confirmed sit.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_sit_dates_change ON public.sit_dates;
CREATE TRIGGER guard_sit_dates_change
BEFORE UPDATE OR DELETE ON public.sit_dates
FOR EACH ROW EXECUTE FUNCTION public.guard_sit_dates_change();


-- ─── 8. listings.timezone from the home's coordinates ──────────────────────
-- When a listing is created or its coordinates change, ask the
-- listing-timezone edge function (offline lookup) to set the zone.

CREATE OR REPLACE FUNCTION public.request_listing_timezone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.latitude IS NOT DISTINCT FROM OLD.latitude
     AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'internal_trigger_secret missing from vault; listing time zone not updated';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/listing-timezone',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    body    := jsonb_build_object('listing_id', NEW.id::text)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to request listing time zone for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_listing_timezone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS request_listing_timezone ON public.listings;
CREATE TRIGGER request_listing_timezone
AFTER INSERT OR UPDATE OF latitude, longitude ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.request_listing_timezone();

-- One-off backfill, run AFTER the listing-timezone function is deployed:
--   SELECT public.request_listing_timezone_backfill();
CREATE OR REPLACE FUNCTION public.request_listing_timezone_backfill()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret';
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'internal_trigger_secret missing from vault';
  END IF;
  PERFORM net.http_post(
    url     := 'https://vcmfvmspymqzwqyxjepi.supabase.co/functions/v1/listing-timezone',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    body    := jsonb_build_object('backfill', true),
    timeout_milliseconds := 55000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_listing_timezone_backfill() FROM PUBLIC, anon, authenticated;