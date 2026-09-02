-- Only the backend/triggers need these; no client role should call them
REVOKE EXECUTE ON FUNCTION public.notify_sitter_on_invite() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_sitter_verification_escalation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_privilege_escalation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_email_verified() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_is_end_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acquire_job_lease(text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_job_lease(text) FROM anon, authenticated;

-- Signed-in only helpers: remove anonymous access
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_members() FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_city_chat(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_unread_messages_count() FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text) FROM anon;