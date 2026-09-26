-- ═══════════════════════════════════════════════════════════════════════════
-- Link chat messages to Ask the Nest questions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- messages.guide_question_id marks a chat message that was sent from Ask the
-- Nest ("Ask {owner}" / "Let {owner} know"), so the chat can show it as a
-- question card and offer the owner "Add this to your Welcome Guide?".
--
-- A real column (not text parsed out of the body): typed, indexed, and
-- checked here. For app writes it may only point to the SENDER'S OWN
-- question, in a conversation between that sitter and the question's listing
-- owner, and it can never be changed afterwards.
-- Saving to the guide still goes through answer_guide_question (owner check).


ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS guide_question_id uuid REFERENCES public.guide_questions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_guide_question_idx
  ON public.messages (guide_question_id)
  WHERE guide_question_id IS NOT NULL;

-- Lookup used by the guard (definer: the sender may not be able to read the
-- listing row directly, e.g. a paused listing).
CREATE OR REPLACE FUNCTION public.guide_question_link_ok(
  p_question_id uuid,
  p_sender_id uuid,
  p_conversation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.guide_questions q
    JOIN public.listings l ON l.id = q.listing_id
    JOIN public.conversations c ON c.id = p_conversation_id
    WHERE q.id = p_question_id
      AND q.sitter_user_id = p_sender_id
      AND c.sitter_user_id = p_sender_id
      AND c.owner_user_id = l.owner_user_id
  );
$function$;

-- The guard below runs as the app user, so signed-in users need EXECUTE. It
-- only answers yes/no for ids the caller supplies.
REVOKE ALL ON FUNCTION public.guide_question_link_ok(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guide_question_link_ok(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_message_guide_question()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $function$
BEGIN
  -- Only direct app writes are restricted, like the other guards.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.guide_question_id IS DISTINCT FROM OLD.guide_question_id THEN
      RAISE EXCEPTION 'This message''s question link can''t be changed.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.guide_question_id IS NOT NULL
     AND NOT public.guide_question_link_ok(NEW.guide_question_id, NEW.sender_user_id, NEW.conversation_id) THEN
    RAISE EXCEPTION 'That question can''t be linked to this conversation.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_message_guide_question ON public.messages;
CREATE TRIGGER guard_message_guide_question
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_guide_question();