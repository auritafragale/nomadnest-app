-- 1. Review flag columns -------------------------------------------------
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS flag_home_cleanliness boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_undisclosed_cameras boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_pet_aggression boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_sitter_cleanliness boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_pet_neglect boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_abandonment boolean NOT NULL DEFAULT false;

-- 2. Profile trust columns ------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reliability_score numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS flagged_for_admin_review boolean NOT NULL DEFAULT false;

-- 3. Listing / sit-date / pet structured fields ---------------------------
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS remote_location boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS car_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS heavy_gardening boolean NOT NULL DEFAULT false;

ALTER TABLE public.sit_dates
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false;

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS requires_medication boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS separation_anxiety_tolerance text,
  ADD COLUMN IF NOT EXISTS reactive_to_animals boolean NOT NULL DEFAULT false;

-- 4. Private community flags ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid REFERENCES public.reviews(id) ON DELETE CASCADE,
  sit_id uuid REFERENCES public.sits(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('listing', 'user')),
  subject_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.community_flags TO service_role;
ALTER TABLE public.community_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view community flags"
  ON public.community_flags FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE TABLE IF NOT EXISTS public.community_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('listing', 'user')),
  subject_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,
  category text NOT NULL,
  flag_count integer NOT NULL DEFAULT 0,
  strike_two_email_sent_at timestamptz,
  show_strike_three_warning boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, category)
);
GRANT SELECT ON public.community_strikes TO authenticated;
GRANT ALL ON public.community_strikes TO service_role;
ALTER TABLE public.community_strikes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can see active strike-three warnings"
  ON public.community_strikes FOR SELECT TO authenticated
  USING (show_strike_three_warning = true OR public.is_admin_user(auth.uid()));

CREATE TRIGGER update_community_strikes_updated_at
  BEFORE UPDATE ON public.community_strikes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Cancellation strikes ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cancellation_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sit_id uuid REFERENCES public.sits(id) ON DELETE SET NULL,
  days_before_start integer,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cancellation_strikes TO authenticated;
GRANT ALL ON public.cancellation_strikes TO service_role;
ALTER TABLE public.cancellation_strikes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members see their own cancellation strikes"
  ON public.cancellation_strikes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_user(auth.uid()));

-- 6. Welcome guides ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.welcome_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL UNIQUE REFERENCES public.listings(id) ON DELETE CASCADE,
  wifi_info text,
  vet_info text,
  feeding_schedule text,
  emergency_contacts text,
  house_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_guides TO authenticated;
GRANT ALL ON public.welcome_guides TO service_role;
ALTER TABLE public.welcome_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their welcome guide"
  ON public.welcome_guides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.owner_user_id = auth.uid()));

CREATE POLICY "Confirmed nomads can read the welcome guide"
  ON public.welcome_guides FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sits s
    WHERE s.listing_id = welcome_guides.listing_id
      AND s.sitter_user_id = auth.uid()
      AND s.status IN ('confirmed', 'in_progress', 'completed')
  ));

CREATE TRIGGER update_welcome_guides_updated_at
  BEFORE UPDATE ON public.welcome_guides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Sit check-ins -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sit_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sit_id uuid NOT NULL REFERENCES public.sits(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pets_fed', 'meds_given', 'walk_completed', 'note')),
  note text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sit_checkins TO authenticated;
GRANT ALL ON public.sit_checkins TO service_role;
ALTER TABLE public.sit_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sit participants can read check-ins"
  ON public.sit_checkins FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sits s
    WHERE s.id = sit_checkins.sit_id
      AND (s.sitter_user_id = auth.uid() OR s.owner_user_id = auth.uid())
  ));

CREATE POLICY "Nomads can add check-ins to their own sit"
  ON public.sit_checkins FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sits s
      WHERE s.id = sit_checkins.sit_id
        AND s.sitter_user_id = auth.uid()
        AND s.status IN ('confirmed', 'in_progress')
    )
  );

-- 8. Review-rate lookup --------------------------------------------------
CREATE OR REPLACE VIEW public.member_review_rates AS
SELECT
  p.id AS user_id,
  COALESCE(rw.written, 0)::integer AS reviews_written,
  COALESCE(sa.attended, 0)::integer AS sits_attended,
  CASE
    WHEN COALESCE(sa.attended, 0) = 0 THEN NULL
    ELSE ROUND((COALESCE(rw.written, 0)::numeric / sa.attended) * 100)
  END AS review_rate
FROM public.profiles p
LEFT JOIN (
  SELECT reviewer_user_id, COUNT(*) AS written
  FROM public.reviews GROUP BY reviewer_user_id
) rw ON rw.reviewer_user_id = p.id
LEFT JOIN (
  SELECT user_id, COUNT(*) AS attended FROM (
    SELECT sitter_user_id AS user_id FROM public.sits WHERE status = 'completed'
    UNION ALL
    SELECT owner_user_id AS user_id FROM public.sits WHERE status = 'completed'
  ) x GROUP BY user_id
) sa ON sa.user_id = p.id;

GRANT SELECT ON public.member_review_rates TO authenticated;

-- 9. Symmetric flag escalation + redemption ------------------------------
CREATE OR REPLACE FUNCTION public.process_review_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sit public.sits%ROWTYPE;
  v_is_sitter_review boolean;
  v_subject_type text;
  v_subject_id uuid;
  v_subject_user uuid;
  v_categories text[];
  v_flagged text[];
  v_cat text;
  v_count integer;
BEGIN
  SELECT * INTO v_sit FROM public.sits WHERE id = NEW.sit_id;
  IF v_sit.id IS NULL THEN RETURN NEW; END IF;

  -- Reviewer is the nomad => the home / Pet Parent is the subject.
  v_is_sitter_review := (NEW.reviewer_user_id = v_sit.sitter_user_id);

  IF v_is_sitter_review THEN
    v_subject_type := 'listing';
    v_subject_id := v_sit.listing_id;
    v_subject_user := v_sit.owner_user_id;
    v_categories := ARRAY['home_cleanliness', 'undisclosed_cameras', 'pet_aggression'];
    v_flagged := ARRAY[]::text[];
    IF NEW.flag_home_cleanliness THEN v_flagged := v_flagged || 'home_cleanliness'; END IF;
    IF NEW.flag_undisclosed_cameras THEN v_flagged := v_flagged || 'undisclosed_cameras'; END IF;
    IF NEW.flag_pet_aggression THEN v_flagged := v_flagged || 'pet_aggression'; END IF;
  ELSE
    v_subject_type := 'user';
    v_subject_id := v_sit.sitter_user_id;
    v_subject_user := v_sit.sitter_user_id;
    v_categories := ARRAY['sitter_cleanliness', 'pet_neglect', 'abandonment'];
    v_flagged := ARRAY[]::text[];
    IF NEW.flag_sitter_cleanliness THEN v_flagged := v_flagged || 'sitter_cleanliness'; END IF;
    IF NEW.flag_pet_neglect THEN v_flagged := v_flagged || 'pet_neglect'; END IF;
    IF NEW.flag_abandonment THEN v_flagged := v_flagged || 'abandonment'; END IF;
  END IF;

  FOREACH v_cat IN ARRAY v_categories LOOP
    IF v_cat = ANY (v_flagged) THEN
      INSERT INTO public.community_flags (
        review_id, sit_id, reporter_user_id, subject_type, subject_id, subject_user_id, category
      ) VALUES (
        NEW.id, NEW.sit_id, NEW.reviewer_user_id, v_subject_type, v_subject_id, v_subject_user, v_cat
      );

      INSERT INTO public.community_strikes (
        subject_type, subject_id, subject_user_id, category, flag_count
      ) VALUES (v_subject_type, v_subject_id, v_subject_user, v_cat, 1)
      ON CONFLICT (subject_type, subject_id, category)
      DO UPDATE SET flag_count = public.community_strikes.flag_count + 1,
                    updated_at = now()
      RETURNING flag_count INTO v_count;

      IF v_count >= 3 THEN
        UPDATE public.community_strikes
        SET show_strike_three_warning = true, updated_at = now()
        WHERE subject_type = v_subject_type AND subject_id = v_subject_id AND category = v_cat;
      END IF;
    ELSE
      -- Redemption: a clean next sit resets this category entirely.
      UPDATE public.community_strikes
      SET flag_count = 0,
          show_strike_three_warning = false,
          strike_two_email_sent_at = NULL,
          updated_at = now()
      WHERE subject_type = v_subject_type
        AND subject_id = v_subject_id
        AND category = v_cat
        AND flag_count > 0;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER process_review_flags
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.process_review_flags();

-- 10. Cancellation strike + urgent sit handling --------------------------
CREATE OR REPLACE FUNCTION public.handle_sit_cancellation_trust()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_days integer;
  v_actor uuid;
  v_strikes integer;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT start_date INTO v_start FROM public.sit_dates WHERE id = NEW.sit_dates_id;
  IF v_start IS NULL THEN RETURN NEW; END IF;
  v_days := v_start - CURRENT_DATE;

  v_actor := COALESCE(auth.uid(), NEW.owner_user_id);

  IF v_days <= 14 AND v_days >= 0 THEN
    INSERT INTO public.cancellation_strikes (user_id, sit_id, days_before_start)
    VALUES (v_actor, NEW.id, v_days);

    SELECT COUNT(*) INTO v_strikes
    FROM public.cancellation_strikes WHERE user_id = v_actor;

    UPDATE public.profiles
    SET reliability_score = GREATEST(0, 100 - (v_strikes * 10)),
        flagged_for_admin_review = (v_strikes >= 2)
    WHERE id = v_actor;
  END IF;

  IF v_days <= 7 AND v_days >= 0 THEN
    UPDATE public.sit_dates
    SET is_urgent = true, status = 'open'
    WHERE id = NEW.sit_dates_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER handle_sit_cancellation_trust
  AFTER UPDATE ON public.sits
  FOR EACH ROW EXECUTE FUNCTION public.handle_sit_cancellation_trust();