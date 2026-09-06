REVOKE ALL ON FUNCTION public.ensure_city_chat_room_for_sit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_city_chat_room_for_sit() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_city_chat_room_for_sit() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_city_chat_room_for_sit() TO service_role;