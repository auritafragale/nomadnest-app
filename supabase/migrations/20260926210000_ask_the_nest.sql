-- ═══════════════════════════════════════════════════════════════════════════
-- Sit Companion, Stage 3: Ask the Nest
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. guide_questions: every Ask the Nest question (incl. emergency checks).
--    Sitter sees their own; the listing owner sees their sitters'. Written by
--    the ask-the-nest edge function and the RPCs below, never directly.
-- 2. guide_qa: the guide's Q&A section (owner answers saved to the guide).
--    Owner manages it; sitters only get it through get_sitter_guide, where
--    "arrival_only" answers follow the 48-hour arrival window.
-- 3. get_sitter_guide: same access rules as Stage 2, plus owner_first_name,
--    owner_user_id and qa. Also restores the pets key feeding_details (the
--    applied Stage 2 copy returned it as feedingDetails, so sitters saw no
--    feeding instructions).
-- 4. mark_guide_question_asked / answer_guide_question RPCs.
-- 5. notify_guide_unlocks: at most one notification per person per listing
--    per day (each sit is still recorded as notified).
-- 6. app_settings.ask_nest_enabled = false.


-- ─── 1. guide_questions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guide_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sit_id uuid NOT NULL REFERENCES public.sits(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  sitter_user_id uuid NOT NULL,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
  answered_from_guide boolean NOT NULL DEFAULT false,
  is_emergency boolean NOT NULL DEFAULT false,
  asked_owner_at timestamptz,
  owner_answer text,
  added_to_guide boolean NOT NULL DEFAULT false,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guide_questions_listing_idx ON public.guide_questions (listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guide_questions_sitter_idx ON public.guide_questions (sitter_user_id, created_at DESC);

ALTER TABLE public.guide_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guide_questions FROM anon, authenticated;
GRANT SELECT ON public.guide_questions TO authenticated;
GRANT ALL ON public.guide_questions TO service_role;

DROP TRIGGER IF EXISTS update_guide_questions_updated_at ON public.guide_questions;
CREATE TRIGGER update_guide_questions_updated_at
BEFORE UPDATE ON public.guide_questions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Sitters see their own guide questions" ON public.guide_questions;
CREATE POLICY "Sitters see their own guide questions"
ON public.guide_questions FOR SELECT TO authenticated
USING (sitter_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners see their sitters' guide questions" ON public.guide_questions;
CREATE POLICY "Owners see their sitters' guide questions"
ON public.guide_questions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = guide_questions.listing_id AND l.owner_user_id = auth.uid()));


-- ─── 2. guide_qa ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guide_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 2000),
  -- Answers about keys, codes, alarm, Wi-Fi...: only shown in the arrival window.
  arrival_only boolean NOT NULL DEFAULT false,
  source_question_id uuid REFERENCES public.guide_questions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guide_qa_listing_idx ON public.guide_qa (listing_id, created_at);

ALTER TABLE public.guide_qa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guide_qa FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_qa TO authenticated;
GRANT ALL ON public.guide_qa TO service_role;

DROP TRIGGER IF EXISTS update_guide_qa_updated_at ON public.guide_qa;
CREATE TRIGGER update_guide_qa_updated_at
BEFORE UPDATE ON public.guide_qa
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Owners manage their guide Q&A" ON public.guide_qa;
CREATE POLICY "Owners manage their guide Q&A"
ON public.guide_qa FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = guide_qa.listing_id AND l.owner_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = guide_qa.listing_id AND l.owner_user_id = auth.uid()));


-- ─── 3. get_sitter_guide (Stage 2 rules + owner, Q&A, feeding fix) ─────────

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
  v_owner_first text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO w FROM public.sitter_guide_sit(p_listing_id, v_uid);
  IF w.sit_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_open := now() >= w.unlock_at AND now() < w.ends_at;

  SELECT id, title, address_private, owner_user_id INTO l FROM public.listings WHERE id = p_listing_id;
  SELECT NULLIF(TRIM(first_name), '') INTO v_owner_first FROM public.profiles WHERE id = l.owner_user_id;
  SELECT * INTO g FROM public.welcome_guides WHERE listing_id = p_listing_id;
  SELECT * INTO a FROM public.welcome_guide_access WHERE listing_id = p_listing_id;

  RETURN jsonb_build_object(
    'listing_id', l.id,
    'listing_title', l.title,
    'address', l.address_private,
    'owner_user_id', l.owner_user_id,
    'owner_first_name', COALESCE(v_owner_first, 'the Pet Parent'),
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
        'feeding_details', p.feeding_details,
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
    ), '[]'::jsonb),
    'qa', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id,
        'question', q.question,
        'answer', q.answer,
        'arrival_only', q.arrival_only
      ) ORDER BY q.created_at)
      FROM public.guide_qa q
      WHERE q.listing_id = p_listing_id
        AND (NOT q.arrival_only OR v_open)
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_sitter_guide(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sitter_guide(uuid) TO authenticated;


-- ─── 4. RPCs ───────────────────────────────────────────────────────────────

-- The sitter sent this question (or an emergency alert) to the owner in chat.
CREATE OR REPLACE FUNCTION public.mark_guide_question_asked(p_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.guide_questions
  SET asked_owner_at = COALESCE(asked_owner_at, now())
  WHERE id = p_question_id
    AND sitter_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found.' USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_guide_question_asked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_guide_question_asked(uuid) TO authenticated;

-- The owner answers a sitter's question and saves it to the guide's Q&A.
-- Returns what the app needs to send the answer to the sitter in chat.
CREATE OR REPLACE FUNCTION public.answer_guide_question(
  p_question_id uuid,
  p_answer text,
  p_arrival_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q record;
  v_answer text := NULLIF(TRIM(p_answer), '');
  v_qa_id uuid;
  w record;
BEGIN
  SELECT gq.*, l.owner_user_id INTO q
  FROM public.guide_questions gq
  JOIN public.listings l ON l.id = gq.listing_id
  WHERE gq.id = p_question_id
  FOR UPDATE OF gq;

  IF NOT FOUND OR q.owner_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Question not found.' USING ERRCODE = '42501';
  END IF;
  IF q.is_emergency THEN
    RAISE EXCEPTION 'Emergency checks can''t be saved to the guide.';
  END IF;
  IF v_answer IS NULL THEN
    RAISE EXCEPTION 'Please write an answer first.';
  END IF;
  IF char_length(v_answer) > 2000 THEN
    RAISE EXCEPTION 'Please keep the answer under 2000 characters.';
  END IF;

  INSERT INTO public.guide_qa (listing_id, question, answer, arrival_only, source_question_id)
  VALUES (q.listing_id, q.question, v_answer, COALESCE(p_arrival_only, false), q.id)
  RETURNING id INTO v_qa_id;

  UPDATE public.guide_questions
  SET owner_answer = v_answer, added_to_guide = true, answered_at = now()
  WHERE id = q.id;

  -- Whether this sitter may see arrival details right now: the app must not
  -- send an arrival-only answer in chat before their window opens.
  SELECT * INTO w FROM public.sitter_guide_sit(q.listing_id, q.sitter_user_id);

  RETURN jsonb_build_object(
    'qa_id', v_qa_id,
    'listing_id', q.listing_id,
    'sitter_user_id', q.sitter_user_id,
    'question', q.question,
    'sitter_arrival_open', COALESCE(w.sit_id IS NOT NULL AND now() >= w.unlock_at AND now() < w.ends_at, false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.answer_guide_question(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_guide_question(uuid, text, boolean) TO authenticated;


-- ─── 5. Unlock notifications: at most one per person, listing and day ──────
-- Each sit + date range is still recorded in guide_unlock_notifications, so it
-- is never retried; the extra check stops overlapping sits of the same sitter
-- on the same listing sending identical notifications.

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
    ORDER BY s.created_at
  LOOP
    BEGIN
      IF r.has_key THEN
        INSERT INTO public.guide_unlock_notifications (sit_id, sit_dates_id, kind)
        VALUES (r.sit_id, r.sit_dates_id, 'sitter_ready')
        ON CONFLICT DO NOTHING;
        IF FOUND AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = r.sitter_user_id
            AND n.type = 'guide_unlocked'
            AND n.data->>'listing_id' = r.listing_id::text
            AND n.created_at >= date_trunc('day', now())
        ) THEN
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
        IF FOUND AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = r.owner_user_id
            AND n.type = 'guide_access_missing'
            AND n.data->>'listing_id' = r.listing_id::text
            AND n.created_at >= date_trunc('day', now())
        ) THEN
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


-- ─── 6. Feature flag ───────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value)
VALUES ('ask_nest_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
