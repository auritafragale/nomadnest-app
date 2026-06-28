CREATE OR REPLACE FUNCTION public.mark_conversation_messages_read(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE id = _conversation_id
      AND (owner_user_id = auth.uid() OR sitter_user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = _conversation_id
    AND sender_user_id <> auth.uid()
    AND read_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_messages_read(uuid) TO authenticated;