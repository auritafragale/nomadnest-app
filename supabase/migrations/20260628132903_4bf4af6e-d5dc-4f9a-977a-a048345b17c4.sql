CREATE OR REPLACE FUNCTION public.get_unread_conversations_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT m.conversation_id)::integer
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

REVOKE EXECUTE ON FUNCTION public.get_unread_conversations_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_unread_conversations_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_unread_conversations_count() TO authenticated;