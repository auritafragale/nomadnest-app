-- Batch E1 fixes (E1 is live).
--
-- 1. A report never fails because of the chat attached to it: a
--    conversation whose two members aren't exactly the reporter and the
--    reported member is dropped (conversation_id set to NULL) instead of
--    refusing the report. Every other check stays, including the review
--    rules (published, not your own, once per member).
-- 2. The AI review summary is switched on.

CREATE OR REPLACE FUNCTION public.guard_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.request_is_end_user() THEN
    RETURN NEW;
  END IF;

  -- Only the reporter's own chat with the reported member is kept.
  IF NEW.conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = NEW.conversation_id
      AND auth.uid() IN (c.owner_user_id, c.sitter_user_id)
      AND NEW.target_type::text = 'user'
      AND NEW.target_id IN (c.owner_user_id, c.sitter_user_id)
      AND NEW.target_id <> auth.uid()
  ) THEN
    NEW.conversation_id := NULL;
  END IF;

  IF NEW.target_type::text = 'review' THEN
    -- A published review someone else wrote, reported once per member.
    IF NOT EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.id = NEW.target_id AND r.published_at IS NOT NULL
        AND r.reviewer_user_id IS DISTINCT FROM auth.uid()
    ) THEN
      RAISE EXCEPTION 'This review can''t be reported.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.reports x
      WHERE x.reporter_user_id = auth.uid() AND x.target_type::text = 'review' AND x.target_id = NEW.target_id
    ) THEN
      RAISE EXCEPTION 'You already reported this review.' USING ERRCODE = '23505', HINT = 'already_reported';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_report_insert() FROM PUBLIC, anon, authenticated;

UPDATE public.app_settings SET value = 'true'::jsonb, updated_at = now() WHERE key = 'review_summary_enabled';