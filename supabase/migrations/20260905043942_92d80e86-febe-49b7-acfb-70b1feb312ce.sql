REVOKE ALL ON FUNCTION public.admin_list_community_strikes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_reliability_reviews() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_community_strikes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_reliability_reviews() TO authenticated;
REVOKE ALL ON FUNCTION public.member_review_rates(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_review_rates(uuid[]) TO authenticated;