-- ═══════════════════════════════════════════════════════════════════════════
-- Ask the Nest: draft answers from chat, and soft removal
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. guide_questions.draft_answer: the owner's chat reply, kept when they tap
--    "Later" under it, to prefill "Your answer" in the guide editor. Set only
--    through set_guide_question_draft (owner check, whole group).
-- 2. guide_questions.removed_at: "Remove" in the Dismissed section. Soft: the
--    row is never deleted (admins can still review it), it is hidden from
--    every owner view and can't be restored, answered or grouped into. Set
--    only through remove_guide_question (owner check, whole group, must be
--    dismissed first).
-- 3. get_owner_guide_questions: leaves out removed questions and adds
--    draft_answer and chat_reply (the owner's most recent plain reply after
--    the question in chat, before the next guide question there).
-- 4. set_guide_question_dismissed / answer_guide_question: ignore removed
--    questions.
--
-- guide_questions stays read-only for app users (SELECT only).


-- ─── 1 + 2. Columns ────────────────────────────────────────────────────────

ALTER TABLE public.guide_questions
  ADD COLUMN IF NOT EXISTS draft_answer text,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

ALTER TABLE public.guide_questions DROP CONSTRAINT IF EXISTS guide_questions_draft_answer_len;
ALTER TABLE public.guide_questions
  ADD CONSTRAINT guide_questions_draft_answer_len CHECK (draft_answer IS NULL OR char_length(draft_answer) <= 2000);


-- ─── Draft answer (owner) ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_guide_question_draft(
  p_question_id uuid,
  p_draft text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q record;
  v_root uuid;
  v_draft text := NULLIF(TRIM(p_draft), '');
BEGIN
  SELECT gq.id, gq.listing_id, gq.parent_question_id, gq.removed_at, l.owner_user_id INTO q
  FROM public.guide_questions gq
  JOIN public.listings l ON l.id = gq.listing_id
  WHERE gq.id = p_question_id;

  IF NOT FOUND OR q.owner_user_id IS DISTINCT FROM auth.uid() OR q.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Question not found.' USING ERRCODE = '42501';
  END IF;

  v_root := COALESCE(q.parent_question_id, q.id);

  UPDATE public.guide_questions
  SET draft_answer = LEFT(v_draft, 2000)
  WHERE listing_id = q.listing_id
    AND (id = v_root OR parent_question_id = v_root)
    AND NOT is_emergency
    AND owner_answer IS NULL;

  RETURN jsonb_build_object('listing_id', q.listing_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_guide_question_draft(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_guide_question_draft(uuid, text) TO authenticated;


-- ─── Remove (owner, soft) ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.remove_guide_question(p_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q record;
  v_root uuid;
BEGIN
  SELECT gq.id, gq.listing_id, gq.parent_question_id, gq.removed_at, l.owner_user_id INTO q
  FROM public.guide_questions gq
  JOIN public.listings l ON l.id = gq.listing_id
  WHERE gq.id = p_question_id;

  IF NOT FOUND OR q.owner_user_id IS DISTINCT FROM auth.uid() OR q.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Question not found.' USING ERRCODE = '42501';
  END IF;

  v_root := COALESCE(q.parent_question_id, q.id);

  IF NOT EXISTS (SELECT 1 FROM public.guide_questions WHERE id = v_root AND dismissed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Dismiss the question before removing it.';
  END IF;

  UPDATE public.guide_questions
  SET removed_at = now()
  WHERE listing_id = q.listing_id
    AND (id = v_root OR parent_question_id = v_root)
    AND removed_at IS NULL;

  RETURN jsonb_build_object('listing_id', q.listing_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_guide_question(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_guide_question(uuid) TO authenticated;


-- ─── 4. Dismiss / restore: never touches removed questions ─────────────────

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
  SELECT gq.id, gq.listing_id, gq.parent_question_id, gq.removed_at, l.owner_user_id INTO q
  FROM public.guide_questions gq
  JOIN public.listings l ON l.id = gq.listing_id
  WHERE gq.id = p_question_id;

  IF NOT FOUND OR q.owner_user_id IS DISTINCT FROM auth.uid() OR q.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Question not found.' USING ERRCODE = '42501';
  END IF;

  v_root := COALESCE(q.parent_question_id, q.id);

  -- The whole group moves together.
  UPDATE public.guide_questions
  SET dismissed_at = CASE WHEN COALESCE(p_dismissed, true) THEN COALESCE(dismissed_at, now()) ELSE NULL END
  WHERE listing_id = q.listing_id
    AND (id = v_root OR parent_question_id = v_root)
    AND removed_at IS NULL;

  RETURN jsonb_build_object('listing_id', q.listing_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_guide_question_dismissed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_guide_question_dismissed(uuid, boolean) TO authenticated;


-- ─── 4. answer_guide_question: same as before, but not for removed ones ────

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

  IF NOT FOUND OR q.owner_user_id IS DISTINCT FROM auth.uid() OR q.removed_at IS NOT NULL THEN
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


-- ─── 3. The owner's list ───────────────────────────────────────────────────
-- sit_ended_at: the end of the sit's last day in the listing's time zone, or
-- when it was cancelled if that was earlier.
-- chat_reply: in a conversation owned by the caller, the caller's most recent
-- plain message after the message that sent this question, and before the
-- next guide question in that conversation (so a reply to a later question
-- isn't offered for an earlier one). Check-ins and photos are skipped.

CREATE OR REPLACE FUNCTION public.get_owner_guide_questions(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.listings l WHERE l.id = p_listing_id AND l.owner_user_id = v_uid
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
      'draft_answer', gq.draft_answer,
      'chat_reply', reply.body,
      'chat_reply_at', reply.created_at,
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
        AND removed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 500
    ) gq
    JOIN public.sits s ON s.id = gq.sit_id
    LEFT JOIN LATERAL public.sit_guide_window(gq.sit_id) w ON true
    LEFT JOIN LATERAL (
      SELECT r.body, r.created_at
      FROM public.messages qm
      JOIN public.conversations c ON c.id = qm.conversation_id AND c.owner_user_id = v_uid
      JOIN public.messages r ON r.conversation_id = qm.conversation_id
      WHERE qm.guide_question_id = gq.id
        AND NOT gq.is_emergency
        AND r.sender_user_id = v_uid
        AND r.guide_question_id IS NULL
        AND r.created_at > qm.created_at
        AND r.created_at < COALESCE((
          SELECT min(nx.created_at) FROM public.messages nx
          WHERE nx.conversation_id = qm.conversation_id
            AND nx.guide_question_id IS NOT NULL
            AND nx.created_at > qm.created_at
        ), 'infinity'::timestamptz)
        AND btrim(r.body) <> ''
        AND left(r.body, 11) <> '[[checkin]]'
        AND left(r.body, 9) <> '[[image]]'
      ORDER BY r.created_at DESC
      LIMIT 1
    ) reply ON true
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_owner_guide_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_guide_questions(uuid) TO authenticated;
