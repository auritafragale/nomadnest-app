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

      // Get conversations where user is owner or sitter
      const { data: conversations } = await supabase
        .from("conversations")
        .select("id")
        .or(`owner_user_id.eq.${user.id},sitter_user_id.eq.${user.id}`);

      if (!conversations || conversations.length === 0) return 0;

      const conversationIds = conversations.map((c) => c.id);

      // Count unread messages (not sent by current user and read_at is null)
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .in("conversation_id", conversationIds)
        .neq("sender_user_id", user.id)
        .is("read_at", null);

      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

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
      .channel("unread-messages-count")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          // Play sound if message is from someone else
          if (payload.new && payload.new.sender_user_id !== user.id) {
            playNotificationSound();
          }
          queryClient.invalidateQueries({ queryKey: ["unread-messages", user.id] });
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return { unreadCount, isLoading };
};
