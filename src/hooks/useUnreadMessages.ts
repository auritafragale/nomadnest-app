import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playNotificationSound } from "@/lib/notificationSound";

export const useUnreadMessages = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const previousCountRef = useRef<number>(0);
  const isInitialMount = useRef(true);

  const { data: unreadCount = 0, isLoading } = useQuery({
    queryKey: ["unread-messages", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { data, error } = await supabase.rpc("get_unread_conversations_count");

      if (error) throw error;
      return data || 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Keep app icon badge in sync with unread message count.
  // Guard on isLoading so we don't clear the SW-set badge before data arrives.
  useEffect(() => {
    if (isLoading) return;
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    if (unreadCount > 0) {
      nav.setAppBadge(unreadCount);
    } else {
      nav.clearAppBadge?.();
    }
  }, [unreadCount, isLoading]);

  // Play sound when unread count increases (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousCountRef.current = unreadCount;
      return;
    }

    if (unreadCount > previousCountRef.current) {
      playNotificationSound();
    }
    previousCountRef.current = unreadCount;
  }, [unreadCount]);

  // Subscribe to real-time message changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`unread-messages-count-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as { conversation_id?: string; sender_user_id?: string } | null;
          // Only react to messages from other users
          if (!newMsg || newMsg.sender_user_id === user.id) return;
          playNotificationSound();
          queryClient.invalidateQueries({ queryKey: ["unread-messages", user.id] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["unread-messages", user.id] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return { unreadCount, isLoading };
};
