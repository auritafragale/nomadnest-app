-- ═══════════════════════════════════════════════════════════════════════════
-- Sit Companion, Stage 1: Welcome Guide v2 (per listing, sectioned)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 0. Backup of the existing rows (service role only).
-- 1. welcome_guides becomes ONE GUIDE PER LISTING again (FK + unique), with
--    section c fields, out_of_hours_vet, migrated_notes and na_fields.
--    feeding_schedule, vet_info and wifi_info move out (pets / access table).
-- 2. welcome_guide_access: section d (key/handover, door codes, alarm, Wi-Fi).
--    OWNER-ONLY in this stage; Stage 2 adds the time-windowed sitter unlock.
-- 3. welcome_guide_photos: "snap and explain" photos (owner-only).
-- 4. pets.behaviour_notes: new PRIVATE column (not in the pets column grant),
--    returned by get_pet_private_details (owner-only).
-- 5. Existing rows mapped per listing (see the DO block).
-- 6. get_guide_completion(listing_id): the single source for the % and nudge.
-- 7. welcome-guide-photos private storage bucket, owner-only per listing.
-- 8. app_settings.guide_ai_enabled = false.
--
-- Pet care has ONE source of truth: the pets rows. The guide edits them; the
-- listing reads them.
--
-- Stage 2 note: useWelcomeGuide caches the guide in localStorage; it must never
-- cache section d on a sitter's device (or must clear it when access ends).


-- ─── 0. Backup ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.welcome_guides_backup_20260926 AS
  SELECT * FROM public.welcome_guides;
ALTER TABLE public.welcome_guides_backup_20260926 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.welcome_guides_backup_20260926 FROM anon, authenticated;
GRANT ALL ON public.welcome_guides_backup_20260926 TO service_role;


-- ─── 1. welcome_guides: per listing ────────────────────────────────────────

DROP POLICY IF EXISTS "Owners manage their welcome guide" ON public.welcome_guides;
DROP POLICY IF EXISTS "Confirmed nomads can read the welcome guide" ON public.welcome_guides;

-- Rows are rebuilt per listing from the backup below.
DELETE FROM public.welcome_guides;

ALTER TABLE public.welcome_guides DROP CONSTRAINT IF EXISTS welcome_guides_owner_user_id_key;
DROP INDEX IF EXISTS public.welcome_guides_owner_user_id_key;

ALTER TABLE public.welcome_guides ALTER COLUMN listing_id SET NOT NULL;
ALTER TABLE public.welcome_guides DROP CONSTRAINT IF EXISTS welcome_guides_listing_id_fkey;
ALTER TABLE public.welcome_guides
  ADD CONSTRAINT welcome_guides_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;
ALTER TABLE public.welcome_guides DROP CONSTRAINT IF EXISTS welcome_guides_listing_id_key;
ALTER TABLE public.welcome_guides ADD CONSTRAINT welcome_guides_listing_id_key UNIQUE (listing_id);

ALTER TABLE public.welcome_guides
  ADD COLUMN IF NOT EXISTS out_of_hours_vet text,
  ADD COLUMN IF NOT EXISTS bins_recycling text,
  ADD COLUMN IF NOT EXISTS plants text,
  ADD COLUMN IF NOT EXISTS appliances text,
  ADD COLUMN IF NOT EXISTS heating_cooling text,
  ADD COLUMN IF NOT EXISTS parking text,
  ADD COLUMN IF NOT EXISTS neighbours text,
  ADD COLUMN IF NOT EXISTS migrated_notes text,
  -- Fields the owner marked "Not applicable" (shown as e.g. "No parking").
  ADD COLUMN IF NOT EXISTS na_fields text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.welcome_guides DROP CONSTRAINT IF EXISTS welcome_guides_na_fields_check;
ALTER TABLE public.welcome_guides ADD CONSTRAINT welcome_guides_na_fields_check
  CHECK (na_fields <@ ARRAY['bins_recycling','plants','appliances','heating_cooling','parking','neighbours']::text[]);

ALTER TABLE public.welcome_guides
  DROP COLUMN IF EXISTS feeding_schedule,
  DROP COLUMN IF EXISTS vet_info,
  DROP COLUMN IF EXISTS wifi_info;

-- owner_user_id always mirrors the listing's owner.
CREATE OR REPLACE FUNCTION public.sync_guide_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  SELECT l.owner_user_id INTO NEW.owner_user_id FROM public.listings l WHERE l.id = NEW.listing_id;
  IF NEW.owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_guide_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_guide_owner ON public.welcome_guides;
CREATE TRIGGER sync_guide_owner
BEFORE INSERT OR UPDATE OF listing_id ON public.welcome_guides
FOR EACH ROW EXECUTE FUNCTION public.sync_guide_owner();

CREATE POLICY "Owners manage their welcome guide"
ON public.welcome_guides
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guides.listing_id AND l.owner_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guides.listing_id AND l.owner_user_id = auth.uid()));

-- Narrowed to THIS listing's sitters (was: any of the owner's listings).
-- Stage 2 replaces this with proper access windows. No section d field and no
-- private pet field is reachable through it.
CREATE POLICY "Confirmed nomads can read the welcome guide"
ON public.welcome_guides
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sits s
  WHERE s.listing_id = welcome_guides.listing_id
    AND s.sitter_user_id = auth.uid()
    AND s.status IN ('confirmed', 'in_progress', 'completed')
));

REVOKE ALL ON public.welcome_guides FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_guides TO authenticated;
GRANT ALL ON public.welcome_guides TO service_role;


-- ─── 2. welcome_guide_access (section d, owner-only) ───────────────────────

CREATE TABLE IF NOT EXISTS public.welcome_guide_access (
  listing_id uuid PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  key_handover text,
  door_codes text,
  alarm_instructions text,
  wifi_details text,
  -- "Not applicable" choices (door_codes, alarm_instructions; wifi_details = "No Wi-Fi").
  na_fields text[] NOT NULL DEFAULT '{}'
    CHECK (na_fields <@ ARRAY['door_codes','alarm_instructions','wifi_details']::text[]),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.welcome_guide_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.welcome_guide_access FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_guide_access TO authenticated;
GRANT ALL ON public.welcome_guide_access TO service_role;

DROP TRIGGER IF EXISTS sync_guide_owner ON public.welcome_guide_access;
CREATE TRIGGER sync_guide_owner
BEFORE INSERT OR UPDATE OF listing_id ON public.welcome_guide_access
FOR EACH ROW EXECUTE FUNCTION public.sync_guide_owner();

DROP TRIGGER IF EXISTS update_welcome_guide_access_updated_at ON public.welcome_guide_access;
CREATE TRIGGER update_welcome_guide_access_updated_at
BEFORE UPDATE ON public.welcome_guide_access
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Owners manage their guide access details" ON public.welcome_guide_access;
CREATE POLICY "Owners manage their guide access details"
ON public.welcome_guide_access
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guide_access.listing_id AND l.owner_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guide_access.listing_id AND l.owner_user_id = auth.uid()));


-- ─── 3. welcome_guide_photos (owner-only) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.welcome_guide_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  section text NOT NULL CHECK (section IN ('pets', 'emergency', 'house', 'access')),
  pet_id uuid REFERENCES public.pets(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  note text,
  instruction text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS welcome_guide_photos_listing_idx ON public.welcome_guide_photos (listing_id, section);

ALTER TABLE public.welcome_guide_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.welcome_guide_photos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_guide_photos TO authenticated;
GRANT ALL ON public.welcome_guide_photos TO service_role;

DROP TRIGGER IF EXISTS sync_guide_owner ON public.welcome_guide_photos;
CREATE TRIGGER sync_guide_owner
BEFORE INSERT OR UPDATE OF listing_id ON public.welcome_guide_photos
FOR EACH ROW EXECUTE FUNCTION public.sync_guide_owner();

DROP TRIGGER IF EXISTS update_welcome_guide_photos_updated_at ON public.welcome_guide_photos;
CREATE TRIGGER update_welcome_guide_photos_updated_at
BEFORE UPDATE ON public.welcome_guide_photos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Owners manage their guide photos" ON public.welcome_guide_photos;
CREATE POLICY "Owners manage their guide photos"
ON public.welcome_guide_photos
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guide_photos.listing_id AND l.owner_user_id = auth.uid()))
WITH CHECK (
  EXISTS (SELECT 1 FROM public.listings l WHERE l.id = welcome_guide_photos.listing_id AND l.owner_user_id = auth.uid())
  -- The file must be in the caller's own folder for this listing.
  AND storage_path LIKE auth.uid()::text || '/' || listing_id::text || '/%'
  -- A pet, if given, must belong to the same listing.
  AND (pet_id IS NULL OR EXISTS (SELECT 1 FROM public.pets p WHERE p.id = welcome_guide_photos.pet_id AND p.listing_id = welcome_guide_photos.listing_id))
);


-- ─── 4. pets.behaviour_notes (private) ─────────────────────────────────────
-- Not added to the pets SELECT column grant, so anon/authenticated can't read
-- it directly; owners read it via get_pet_private_details and can still write it.

ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS behaviour_notes text;

DROP FUNCTION IF EXISTS public.get_pet_private_details(uuid);
CREATE FUNCTION public.get_pet_private_details(p_listing_id uuid)
RETURNS TABLE (id uuid, vet_info text, medication_instructions text, behaviour_notes text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.vet_info::text, p.medication_instructions::text, p.behaviour_notes::text
  FROM public.pets p
  JOIN public.listings l ON l.id = p.listing_id
  WHERE p.listing_id = p_listing_id
    AND l.owner_user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_pet_private_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pet_private_details(uuid) TO authenticated;


-- ─── 5. Map the existing (per-owner) guides onto every listing ─────────────
--   house_notes, emergency_contacts -> welcome_guides (each listing)
--   wifi_info                       -> welcome_guide_access.wifi_details
--   vet_info        -> pets.vet_info where empty; if a pet already has a
--                      different value, or the listing has no pets -> migrated_notes
--   feeding_schedule-> pets.feeding_details if exactly one pet and it's empty;
--                      identical text is left as is; anything else -> migrated_notes

DO $$
DECLARE
  g record;
  l record;
  v_pets integer;
  v_notes text;
BEGIN
  FOR g IN SELECT * FROM public.welcome_guides_backup_20260926 WHERE owner_user_id IS NOT NULL LOOP
    FOR l IN SELECT id FROM public.listings WHERE owner_user_id = g.owner_user_id LOOP
      v_notes := '';
      SELECT count(*) INTO v_pets FROM public.pets WHERE listing_id = l.id;

      IF COALESCE(TRIM(g.vet_info), '') <> '' THEN
        IF v_pets = 0 THEN
          v_notes := v_notes || 'Vet details (from your previous guide): ' || g.vet_info || E'\n\n';
        ELSE
          UPDATE public.pets SET vet_info = g.vet_info
          WHERE listing_id = l.id AND COALESCE(TRIM(vet_info), '') = '';
          IF EXISTS (
            SELECT 1 FROM public.pets
            WHERE listing_id = l.id AND TRIM(vet_info) <> TRIM(g.vet_info)
          ) THEN
            v_notes := v_notes || 'Vet details (from your previous guide): ' || g.vet_info || E'\n\n';
          END IF;
        END IF;
      END IF;

      IF COALESCE(TRIM(g.feeding_schedule), '') <> '' THEN
        IF v_pets = 1 AND EXISTS (
          SELECT 1 FROM public.pets WHERE listing_id = l.id AND COALESCE(TRIM(feeding_details), '') = ''
        ) THEN
          UPDATE public.pets SET feeding_details = g.feeding_schedule WHERE listing_id = l.id;
        ELSIF v_pets = 1 AND EXISTS (
          SELECT 1 FROM public.pets WHERE listing_id = l.id AND TRIM(feeding_details) = TRIM(g.feeding_schedule)
        ) THEN
          NULL; -- already there
        ELSE
          v_notes := v_notes || 'Feeding schedule (from your previous guide): ' || g.feeding_schedule || E'\n\n';
        END IF;
      END IF;

      INSERT INTO public.welcome_guides (listing_id, owner_user_id, house_notes, emergency_contacts, migrated_notes, created_at, updated_at)
      VALUES (l.id, g.owner_user_id, g.house_notes, g.emergency_contacts, NULLIF(TRIM(v_notes), ''), g.created_at, g.updated_at)
      ON CONFLICT (listing_id) DO NOTHING;

      IF COALESCE(TRIM(g.wifi_info), '') <> '' THEN
        INSERT INTO public.welcome_guide_access (listing_id, owner_user_id, wifi_details)
        VALUES (l.id, g.owner_user_id, g.wifi_info)
        ON CONFLICT (listing_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;


-- ─── 6. Completion ──────────────────────────────────────────────────────────
-- Each section is worth 25%, with partial credit per required item:
--   pets:      each pet needs feeding + routine (+ medication if it takes any).
--              No pets = complete.
--   emergency: emergency contacts, plus (if there are pets) vet details on at
--              least one pet or an out-of-hours vet.
--   house:     at least 2 house fields filled or marked Not applicable.
--   access:    key/handover (always required) + Wi-Fi (or "No Wi-Fi").
-- Nudge priority: pets, emergency, access, house.

CREATE OR REPLACE FUNCTION public.get_guide_completion(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  g record;
  a record;
  v_pet_items integer := 0;
  v_pet_done integer := 0;
  v_pet_count integer := 0;
  v_first_pet text;
  v_has_vet boolean;
  v_emerg_items integer;
  v_emerg_done integer := 0;
  v_house_handled integer := 0;
  v_access_done integer := 0;
  f_pets numeric;
  f_emerg numeric;
  f_house numeric;
  f_access numeric;
  v_percent integer;
  v_nudge text;
  p record;
BEGIN
  SELECT owner_user_id INTO v_owner FROM public.listings WHERE id = p_listing_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;
  -- Owners only (NULL = called from inside another database function).
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_owner THEN
    RAISE EXCEPTION 'Listing not found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO g FROM public.welcome_guides WHERE listing_id = p_listing_id;
  SELECT * INTO a FROM public.welcome_guide_access WHERE listing_id = p_listing_id;

  -- a) Pets
  FOR p IN
    SELECT name, type, feeding_details, daily_routine, medication_instructions,
           (COALESCE(requires_medication, false) OR COALESCE(has_medication, false)) AS on_meds
    FROM public.pets WHERE listing_id = p_listing_id ORDER BY created_at
  LOOP
    v_pet_count := v_pet_count + 1;
    v_pet_items := v_pet_items + 2 + CASE WHEN p.on_meds THEN 1 ELSE 0 END;
    v_pet_done := v_pet_done
      + CASE WHEN COALESCE(TRIM(p.feeding_details), '') <> '' THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(TRIM(p.daily_routine), '') <> '' THEN 1 ELSE 0 END
      + CASE WHEN p.on_meds AND COALESCE(TRIM(p.medication_instructions), '') <> '' THEN 1 ELSE 0 END;
    IF v_first_pet IS NULL AND (
         COALESCE(TRIM(p.feeding_details), '') = ''
      OR COALESCE(TRIM(p.daily_routine), '') = ''
      OR (p.on_meds AND COALESCE(TRIM(p.medication_instructions), '') = '')
    ) THEN
      v_first_pet := COALESCE(NULLIF(TRIM(p.name), ''), 'your ' || LOWER(p.type));
    END IF;
  END LOOP;
  f_pets := CASE WHEN v_pet_items = 0 THEN 1 ELSE v_pet_done::numeric / v_pet_items END;

  -- b) Vet and emergency
  v_has_vet := COALESCE(TRIM(g.out_of_hours_vet), '') <> ''
    OR EXISTS (SELECT 1 FROM public.pets WHERE listing_id = p_listing_id AND COALESCE(TRIM(vet_info), '') <> '');
  v_emerg_items := CASE WHEN v_pet_count > 0 THEN 2 ELSE 1 END;
  v_emerg_done := CASE WHEN COALESCE(TRIM(g.emergency_contacts), '') <> '' THEN 1 ELSE 0 END
    + CASE WHEN v_pet_count > 0 AND v_has_vet THEN 1 ELSE 0 END;
  f_emerg := v_emerg_done::numeric / v_emerg_items;

  -- c) House: at least 2 fields filled or marked Not applicable
  v_house_handled :=
      CASE WHEN COALESCE(TRIM(g.house_notes), '') <> '' THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(TRIM(g.bins_recycling), '') <> '' OR 'bins_recycling' = ANY(COALESCE(g.na_fields, '{}')) THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(TRIM(g.plants), '') <> '' OR 'plants' = ANY(COALESCE(g.na_fields, '{}')) THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(TRIM(g.appliances), '') <> '' OR 'appliances' = ANY(COALESCE(g.na_fields, '{}')) THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(TRIM(g.heating_cooling), '') <> '' OR 'heating_cooling' = ANY(COALESCE(g.na_fields, '{}')) THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(TRIM(g.parking), '') <> '' OR 'parking' = ANY(COALESCE(g.na_fields, '{}')) THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(TRIM(g.neighbours), '') <> '' OR 'neighbours' = ANY(COALESCE(g.na_fields, '{}')) THEN 1 ELSE 0 END;
  f_house := LEAST(v_house_handled, 2)::numeric / 2;

  -- d) Access: key/handover always required; Wi-Fi filled or "No Wi-Fi"
  v_access_done :=
      CASE WHEN COALESCE(TRIM(a.key_handover), '') <> '' THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(TRIM(a.wifi_details), '') <> '' OR 'wifi_details' = ANY(COALESCE(a.na_fields, '{}')) THEN 1 ELSE 0 END;
  f_access := v_access_done::numeric / 2;

  v_percent := ROUND((f_pets + f_emerg + f_house + f_access) * 25);

  v_nudge := CASE
    WHEN f_pets < 1 THEN 'pets'
    WHEN f_emerg < 1 THEN 'emergency'
    WHEN f_access < 1 THEN 'access'
    WHEN f_house < 1 THEN 'house'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'percent', v_percent,
    'nudge', v_nudge,
    'nudge_pet_name', v_first_pet,
    'sections', jsonb_build_object(
      'pets', jsonb_build_object('complete', f_pets >= 1, 'fraction', ROUND(f_pets, 2)),
      'emergency', jsonb_build_object('complete', f_emerg >= 1, 'fraction', ROUND(f_emerg, 2)),
      'house', jsonb_build_object('complete', f_house >= 1, 'fraction', ROUND(f_house, 2)),
      'access', jsonb_build_object('complete', f_access >= 1, 'fraction', ROUND(f_access, 2))
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_guide_completion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_guide_completion(uuid) TO authenticated;


-- ─── 7. Private photo bucket ────────────────────────────────────────────────
-- Paths: {owner_user_id}/{listing_id}/{file}. Owner-only in this stage.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('welcome-guide-photos', 'welcome-guide-photos', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Owners read their guide photos" ON storage.objects;
DROP POLICY IF EXISTS "Owners upload their guide photos" ON storage.objects;
DROP POLICY IF EXISTS "Owners update their guide photos" ON storage.objects;
DROP POLICY IF EXISTS "Owners delete their guide photos" ON storage.objects;

CREATE POLICY "Owners read their guide photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'welcome-guide-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.listings l WHERE l.id::text = (storage.foldername(name))[2] AND l.owner_user_id = auth.uid())
);

CREATE POLICY "Owners upload their guide photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'welcome-guide-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.listings l WHERE l.id::text = (storage.foldername(name))[2] AND l.owner_user_id = auth.uid())
);

CREATE POLICY "Owners update their guide photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'welcome-guide-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.listings l WHERE l.id::text = (storage.foldername(name))[2] AND l.owner_user_id = auth.uid())
);

CREATE POLICY "Owners delete their guide photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'welcome-guide-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.listings l WHERE l.id::text = (storage.foldername(name))[2] AND l.owner_user_id = auth.uid())
);


-- ─── 8. AI feature flag ─────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value)
VALUES ('guide_ai_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
