-- ═══════════════════════════════════════════════════════════════════════════
-- Ask the Nest: owners manage their sitters' questions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. guide_questions.dismissed_at: the owner chose "Don't add" / "Dismiss".
--    Nothing is deleted; "Restore" clears it. Set only through
--    set_guide_question_dismissed (owner check).
-- 2. guide_questions.parent_question_id: repeats of the same question are
--    linked to the first open one (the group's root) by the ask-the-nest edge
--    function via link_guide_question (service role only). Roots always have
--    parent_question_id = NULL.
-- 3. answer_guide_question: answering any question in a group answers the
--    whole group (one Q&A entry) and returns every sitter to tell in chat.
-- 4. get_owner_guide_questions: the owner's list, with when each sit ended
--    (for the "Older" section and the 7-day emergency window). Questions Ask
--    the Nest answered from the guide are never returned.
--
-- guide_questions stays read-only for app users (SELECT only); every change
-- goes through the definer functions below.


-- ─── 1 + 2. Columns ────────────────────────────────────────────────────────

ALTER TABLE public.guide_questions
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_question_id uuid REFERENCES public.guide_questions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS guide_questions_parent_idx
  ON public.guide_questions (parent_question_id)
  WHERE parent_question_id IS NOT NULL;


-- ─── Dismiss / restore (owner) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_guide_question_dismissed(
  p_question_id uuid,
  p_dismissed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q record;
  v_root uuid;
BEGIN
  SELECT gq.id, gq.listing_id, gq.parent_question_id, l.owner_user_id INTO q
  FROM public.guide_questions gq
  JOIN public.listings l ON l.id = gq.listing_id
  WHERE gq.id = p_question_id;

  IF NOT FOUND OR q.owner_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Question not found.' USING ERRCODE = '42501';
  END IF;

  v_root := COALESCE(q.parent_question_id, q.id);

  -- The whole group moves together.
  UPDATE public.guide_questions
  SET dismissed_at = CASE WHEN COALESCE(p_dismissed, true) THEN COALESCE(dismissed_at, now()) ELSE NULL END
  WHERE listing_id = q.listing_id
    AND (id = v_root OR parent_question_id = v_root);

  RETURN jsonb_build_object('listing_id', q.listing_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_guide_question_dismissed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_guide_question_dismissed(uuid, boolean) TO authenticated;


-- ─── Grouping (service role only, called by ask-the-nest) ──────────────────
-- Links a new question to an open root on the same listing. Re-checks
-- everything here so a stale or wrong AI match can't link across listings or
-- into an answered/dismissed group. Returns false when nothing was linked.

CREATE OR REPLACE FUNCTION public.link_guide_question(
  p_question_id uuid,
  p_parent_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_question_id = p_parent_id THEN
    RETURN false;
  END IF;

  UPDATE public.guide_questions child
  SET parent_question_id = root.id
  FROM public.guide_questions root
  WHERE child.id = p_question_id
    AND root.id = p_parent_id
    AND root.listing_id = child.listing_id
    AND root.parent_question_id IS NULL
    AND NOT root.is_emergency AND NOT root.answered_from_guide
    AND root.owner_answer IS NULL AND root.dismissed_at IS NULL
    AND child.parent_question_id IS NULL
    AND NOT child.is_emergency AND NOT child.answered_from_guide
    AND child.owner_answer IS NULL
    -- the new question must not already be a root others point to
    AND NOT EXISTS (SELECT 1 FROM public.guide_questions c WHERE c.parent_question_id = child.id);
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_guide_question(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_guide_question(uuid, uuid) TO service_role;


-- ─── 3. answer_guide_question: whole group ─────────────────────────────────

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
  v_root uuid;
  w record;
  v_sitters jsonb;
BEGIN
  SELECT gq.*, l.owner_user_id INTO q
  FROM public.guide_questions gq
  JOIN public.listings l ON l.id = gq.listing_id
  WHERE gq.id = p_question_id
  FOR UPDATE OF gq;

  IF NOT FOUND OR q.owner_user_id IS DISTINCT FROM auth.uid() THEN
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

  v_root := COALESCE(q.parent_question_id, q.id);

  INSERT INTO public.guide_qa (listing_id, question, answer, arrival_only, source_question_id)
  VALUES (q.listing_id, q.question, v_answer, COALESCE(p_arrival_only, false), q.id)
  RETURNING id INTO v_qa_id;

  -- Every open question in the group gets the answer.
  UPDATE public.guide_questions
  SET owner_answer = v_answer, added_to_guide = true, answered_at = now(), dismissed_at = NULL
  WHERE listing_id = q.listing_id
    AND NOT is_emergency
    AND (id = q.id OR (owner_answer IS NULL AND (id = v_root OR parent_question_id = v_root)));

  -- Each sitter in the group: whether they currently have guide access (the
  -- app only tells other sitters in the group while their sit is on), and
  -- whether they may see arrival details right now (the app must not send an
  -- arrival-only answer in chat before then).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'sitter_user_id', s.sitter_user_id,
           'has_access', sw.sit_id IS NOT NULL,
           'sitter_arrival_open', COALESCE(sw.sit_id IS NOT NULL AND now() >= sw.unlock_at AND now() < sw.ends_at, false)
         )), '[]'::jsonb)
  INTO v_sitters
  FROM (
    SELECT DISTINCT gq.sitter_user_id
    FROM public.guide_questions gq
    WHERE gq.listing_id = q.listing_id AND (gq.id = q.id OR gq.id = v_root OR gq.parent_question_id = v_root)
  ) s
  LEFT JOIN LATERAL (
    SELECT * FROM public.sitter_guide_sit(q.listing_id, s.sitter_user_id) LIMIT 1
  ) sw ON true;

  SELECT * INTO w FROM public.sitter_guide_sit(q.listing_id, q.sitter_user_id);

  RETURN jsonb_build_object(
    'qa_id', v_qa_id,
    'listing_id', q.listing_id,
    'sitter_user_id', q.sitter_user_id,
    'question', q.question,
    'sitter_arrival_open', COALESCE(w.sit_id IS NOT NULL AND now() >= w.unlock_at AND now() < w.ends_at, false),
    'sitters', v_sitters
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.answer_guide_question(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_guide_question(uuid, text, boolean) TO authenticated;


-- ─── 4. The owner's list ───────────────────────────────────────────────────
-- sit_ended_at: the end of the sit's last day in the listing's time zone, or
-- when it was cancelled if that was earlier.

CREATE OR REPLACE FUNCTION public.get_owner_guide_questions(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.listings l WHERE l.id = p_listing_id AND l.owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Listing not found.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', gq.id,
      'sitter_user_id', gq.sitter_user_id,
      'question', gq.question,
      'answered_from_guide', gq.answered_from_guide,
      'is_emergency', gq.is_emergency,
      'asked_owner_at', gq.asked_owner_at,
      'owner_answer', gq.owner_answer,
      'added_to_guide', gq.added_to_guide,
      'dismissed_at', gq.dismissed_at,
      'parent_question_id', gq.parent_question_id,
      'created_at', gq.created_at,
      'sit_ended_at', CASE
        WHEN s.status = 'cancelled' THEN LEAST(w.ends_at, s.cancelled_at)
        ELSE w.ends_at
      END
    ) ORDER BY gq.created_at DESC)
    FROM (
      SELECT * FROM public.guide_questions
      WHERE listing_id = p_listing_id
        AND NOT answered_from_guide
        AND owner_answer IS NULL
      ORDER BY created_at DESC
      LIMIT 500
    ) gq
    JOIN public.sits s ON s.id = gq.sit_id
    LEFT JOIN LATERAL public.sit_guide_window(gq.sit_id) w ON true
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_owner_guide_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_guide_questions(uuid) TO authenticated;
