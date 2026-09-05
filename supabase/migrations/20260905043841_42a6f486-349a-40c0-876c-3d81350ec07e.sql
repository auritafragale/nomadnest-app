REVOKE ALL ON FUNCTION public.process_review_flags() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_sit_cancellation_trust() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.member_review_rates(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.member_review_rates(uuid[]) TO authenticated;