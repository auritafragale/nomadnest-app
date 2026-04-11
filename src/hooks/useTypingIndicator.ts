import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TypingState {
  userId: string;
  userName: string;
  isTyping: boolean;
}

export const useTypingIndicator = (conversationId: string | null, userId: string | null, userName: string) => {
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [typingUserName, setTypingUserName] = useState("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingRef = useRef<number>(0);

  useEffect(() => {
    if (!conversationId || !userId) return;

    const channelName = `typing:${conversationId}`;
    
    const channel = supabase.channel(channelName)
      .on("broadcast", { event: "typing" }, (payload) => {
        const data = payload.payload as TypingState;
        
        // Ignore our own typing events
        if (data.userId === userId) return;
        
        if (data.isTyping) {
          setIsOtherTyping(true);
          setTypingUserName(data.userName);
          
          // Auto-clear typing indicator after 3 seconds if no update
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setIsOtherTyping(false);
          }, 3000);
        } else {
          setIsOtherTyping(false);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, userId]);

  const sendTypingIndicator = useCallback((isTyping: boolean) => {
    if (!conversationId || !userId) return;

    // Throttle typing events to max once per second
    const now = Date.now();
    if (isTyping && now - lastTypingRef.current < 1000) return;
    lastTypingRef.current = now;

    const channelName = `typing:${conversationId}`;
    
    supabase.channel(channelName).send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId,
        userName,
        isTyping,
      } as TypingState,
    });
  }, [conversationId, userId, userName]);

  return {
    isOtherTyping,
    typingUserName,
    sendTypingIndicator,
  };
};
