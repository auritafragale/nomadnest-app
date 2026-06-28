REVOKE EXECUTE ON FUNCTION public.mark_conversation_messages_read(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_messages_read(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_messages_read(uuid) TO authenticated;