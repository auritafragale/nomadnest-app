-- Count total unread messages (not just conversations with unread messages).
-- Used for the app icon badge so it reflects the actual number of messages
-- waiting, not just the number of threads.
CREATE OR REPLACE FUNCTION public.get_unread_messages_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(m.id)::integer
  FROM public.messages m
  WHERE m.sender_user_id <> auth.uid()
    AND m.read_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = m.conversation_id
        AND (c.owner_user_id = auth.uid() OR c.sitter_user_id = auth.uid())
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_unread_messages_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_unread_messages_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_unread_messages_count() TO authenticated;
