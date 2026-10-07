import { useState, useEffect, useCallback, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface TypingState {
  userId: string;
  userName: string;
  isTyping: boolean;
}

/**
 * "{name} is typing…" for one chat. One broadcast channel per chat,
 * subscribed once; sending reuses the same channel.
 */
export const useTypingIndicator = (conversationId: string | null, userId: string | null, userName: string) => {
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [typingUserName, setTypingUserName] = useState("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingRef = useRef<number>(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!conversationId || !userId) return;

    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        const data = payload.payload as TypingState;
        // Ignore our own typing events
        if (data.userId === userId) return;

        if (data.isTyping) {
          setIsOtherTyping(true);
          setTypingUserName(data.userName);
          // Auto-clear after 3 seconds without an update.
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3000);
        } else {
          setIsOtherTyping(false);
        }
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
      setIsOtherTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [conversationId, userId]);

  const sendTypingIndicator = useCallback(
    (isTyping: boolean) => {
      const channel = channelRef.current;
      if (!channel || !userId) return;

      // Throttle typing events to max once per second
      const now = Date.now();
      if (isTyping && now - lastTypingRef.current < 1000) return;
      lastTypingRef.current = now;

      channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId, userName, isTyping } as TypingState,
      });
    },
    [userId, userName],
  );

  return { isOtherTyping, typingUserName, sendTypingIndicator };
};
