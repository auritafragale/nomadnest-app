import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import type { Notification } from "@/hooks/useNotifications";
import { playNotificationSound } from "@/lib/notificationSound";

/**
 * Notification types that mirror a chat message. They are left out of the
 * app badge, so one new message counts once (it is already an unread
 * message), and opening the chat clears both.
 */
const MESSAGE_MIRROR_TYPES = ["new_message", "phone_shared"];

/**
 * The single owner of the realtime unread state: one subscription for new
 * messages and one for notifications, the new-message sound (once per
 * message) and the app icon badge (unread messages + other unread
 * notifications). Mounted once in App.
 */
const UnreadSync = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { unreadCount: unreadMessages, isLoading } = useUnreadMessages();

  const { data: otherNotifications = 0 } = useQuery({
    queryKey: ["notifications-unread-count", user?.id, "badge"],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null)
        .not("type", "in", `(${MESSAGE_MIRROR_TYPES.join(",")})`);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  // New messages: sound once, then refresh the counts and the chat list.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`unread-sync-messages-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as { sender_user_id?: string | null; body?: string } | null;
        if (!msg || msg.sender_user_id === user.id) return;
        playNotificationSound();
        queryClient.setQueryData<number>(["unread-messages", user.id], (old = 0) => old + 1);
        queryClient.invalidateQueries({ queryKey: ["unread-messages", user.id] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-messages", user.id] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // New notifications: add to the list and refresh the counts.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`unread-sync-notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as Notification;
          queryClient.setQueryData<Notification[]>(["notifications", user.id], (old) =>
            !old ? [row] : old.some((n) => n.id === row.id) ? old : [row, ...old],
          );
          queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // The app icon badge. Guarded on loading so a badge the service worker set
  // isn't cleared before the counts arrive.
  const lastBadge = useRef<number | null>(null);
  useEffect(() => {
    if (!user || isLoading) return;
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    const total = unreadMessages + otherNotifications;
    if (lastBadge.current === total) return;
    lastBadge.current = total;
    if (total > 0) nav.setAppBadge(total).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [user, isLoading, unreadMessages, otherNotifications]);

  return null;
};

export default UnreadSync;
