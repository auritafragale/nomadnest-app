-- 1. Threads
ALTER TABLE public.city_chat_messages
  ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES public.city_chat_messages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS city_chat_messages_room_parent_created_idx
  ON public.city_chat_messages (room_id, parent_message_id, created_at);

CREATE INDEX IF NOT EXISTS city_chat_messages_parent_idx
  ON public.city_chat_messages (parent_message_id, created_at);

-- 2. Room coordinates for "cities near me"
ALTER TABLE public.city_chat_rooms
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

-- 3. Reactions
CREATE TABLE IF NOT EXISTS public.city_chat_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.city_chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

GRANT SELECT, INSERT, DELETE ON public.city_chat_message_reactions TO authenticated;
GRANT ALL ON public.city_chat_message_reactions TO service_role;

ALTER TABLE public.city_chat_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view reactions in accessible city chats"
ON public.city_chat_message_reactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.city_chat_messages m
    WHERE m.id = message_id
      AND public.can_access_city_chat(m.room_id, auth.uid())
  )
);

CREATE POLICY "Members can add their own reactions"
ON public.city_chat_message_reactions
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.city_chat_messages m
    WHERE m.id = message_id
      AND public.can_access_city_chat(m.room_id, auth.uid())
  )
);

CREATE POLICY "Members can remove their own reactions"
ON public.city_chat_message_reactions
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS city_chat_message_reactions_message_idx
  ON public.city_chat_message_reactions (message_id);

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.city_chat_message_reactions;

-- 5. Thread summaries for a room
CREATE OR REPLACE FUNCTION public.city_chat_thread_summaries(p_room_id uuid)
RETURNS TABLE(parent_message_id uuid, reply_count bigint, replier_avatars text[], last_reply_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_city_chat(p_room_id, auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.parent_message_id,
         COUNT(*)::bigint,
         (ARRAY_AGG(DISTINCT p.avatar_url) FILTER (WHERE p.avatar_url IS NOT NULL))[1:3],
         MAX(m.created_at)
  FROM public.city_chat_messages m
  LEFT JOIN public.profiles p ON p.id = m.sender_user_id
  WHERE m.room_id = p_room_id
    AND m.parent_message_id IS NOT NULL
  GROUP BY m.parent_message_id;
END;
$$;