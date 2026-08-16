REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_listing_private_address(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_unread_conversations_count() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_messages_read(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redeem_founding_member_code(text, uuid) FROM anon;