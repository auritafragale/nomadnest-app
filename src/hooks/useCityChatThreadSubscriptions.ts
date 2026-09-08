import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tracks which city-chat threads (top-level messages) the current user is
 * "watching" — i.e. has a row in city_chat_thread_subscriptions for — and
 * lets them toggle that per thread. Replying to a thread auto-subscribes the
 * replier server-side (see the notify_city_chat_thread_subscribers trigger);
 * this hook's toggle is only for watching a thread without posting in it.
 */
export const useCityChatThreadSubscriptions = () => {
  const { user } = useAuth();
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setSubscribed(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("city_chat_thread_subscriptions")
      .select("thread_message_id")
      .eq("user_id", user.id);
    if (!error) {
      setSubscribed(new Set((data || []).map((r) => r.thread_message_id)));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const isSubscribed = useCallback(
    (threadId: string) => subscribed.has(threadId),
    [subscribed],
  );

  const toggle = useCallback(
    async (threadId: string) => {
      if (!user) return;
      const wasSubscribed = subscribed.has(threadId);

      // Optimistic update — reverted below if the write fails.
      setSubscribed((prev) => {
        const next = new Set(prev);
        if (wasSubscribed) next.delete(threadId);
        else next.add(threadId);
        return next;
      });

      const { error } = wasSubscribed
        ? await supabase
            .from("city_chat_thread_subscriptions")
            .delete()
            .eq("thread_message_id", threadId)
            .eq("user_id", user.id)
        : await supabase
            .from("city_chat_thread_subscriptions")
            .insert({ thread_message_id: threadId, user_id: user.id });

      if (error) {
        setSubscribed((prev) => {
          const next = new Set(prev);
          if (wasSubscribed) next.add(threadId);
          else next.delete(threadId);
          return next;
        });
      }
    },
    [user, subscribed],
  );

  return { isSubscribed, toggle, loading };
};
