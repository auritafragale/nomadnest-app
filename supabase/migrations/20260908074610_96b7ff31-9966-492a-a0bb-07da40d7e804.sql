-- 1. Official NomadNest Team account (system sender for pinned topics)
INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-00000000f00d', 'authenticated', 'authenticated', 'team@nomadnest.global', now(), now(), now(), '{"provider":"system","providers":["system"]}'::jsonb, '{"first_name":"NomadNest","last_name":"Team"}'::jsonb, false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, first_name, last_name)
VALUES ('00000000-0000-4000-8000-00000000f00d', 'team@nomadnest.global', 'NomadNest', 'Team')
ON CONFLICT (id) DO UPDATE SET first_name = 'NomadNest', last_name = 'Team';

-- 2. Pinned flag on city chat messages
ALTER TABLE public.city_chat_messages
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- 3. Seed the three pinned topics into every new room
CREATE OR REPLACE FUNCTION public.seed_city_chat_pinned_topics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.city_chat_messages (room_id, sender_user_id, content, is_pinned)
  VALUES
    (NEW.id, '00000000-0000-4000-8000-00000000f00d', '🚨 Emergency', true),
    (NEW.id, '00000000-0000-4000-8000-00000000f00d', '🐾 Pet Play Dates', true),
    (NEW.id, '00000000-0000-4000-8000-00000000f00d', '💻 Co-Working Hangout', true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed_city_chat_pinned_topics failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_city_chat_pinned_topics ON public.city_chat_rooms;
CREATE TRIGGER seed_city_chat_pinned_topics
AFTER INSERT ON public.city_chat_rooms
FOR EACH ROW EXECUTE FUNCTION public.seed_city_chat_pinned_topics();

-- 4. City chat access is now earned only through a sit in that city
CREATE OR REPLACE FUNCTION public.can_access_city_chat(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_city text;
BEGIN
  SELECT city INTO v_city FROM public.city_chat_rooms WHERE id = p_room_id;

  IF v_city IS NULL THEN RETURN false; END IF;

  -- Nomads with a confirmed or in-progress sit in this city can join for the whole sit.
  IF EXISTS (
    SELECT 1 FROM public.sits s
    JOIN public.sit_dates sd ON sd.id = s.sit_dates_id
    JOIN public.listings l ON l.id = s.listing_id
    WHERE s.sitter_user_id = p_user_id
      AND s.status IN ('confirmed', 'in_progress')
      AND sd.end_date >= CURRENT_DATE
      AND LOWER(TRIM(l.city)) = LOWER(TRIM(v_city))
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;