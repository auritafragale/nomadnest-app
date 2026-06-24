ALTER PUBLICATION supabase_realtime ADD TABLE public.city_chat_messages;
ALTER TABLE public.city_chat_messages REPLICA IDENTITY FULL;
GRANT INSERT ON public.city_chat_rooms TO authenticated;