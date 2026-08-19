REVOKE ALL ON FUNCTION public.is_active_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_perk_discount_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_perks() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_perk_click_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_perk_discount_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_perks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_perk_click_stats() TO authenticated;