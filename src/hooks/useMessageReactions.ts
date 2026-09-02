import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const REACTION_EMOJIS = ["❤️", "👍", "😂", "🔥", "👏"] as const;

interface ReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
}

/**
 * Loads and keeps in sync every reaction on messages inside a city chat room.
 */
export const useMessageReactions = (roomId: string | undefined, enabled: boolean) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReactionRow[]>([]);

  useEffect(() => {
    if (!roomId || !enabled) return;
    let mounted = true;

    const load = async () => {
      const { data } = await supabase
        .from("city_chat_message_reactions")
        .select("id, message_id, user_id, emoji, city_chat_messages!inner(room_id)")
        .eq("city_chat_messages.room_id", roomId);
      if (mounted && data) {
        setRows(
          data.map((r) => ({
            id: r.id,
            message_id: r.message_id,
            user_id: r.user_id,
            emoji: r.emoji,
          })),
        );
      }
    };
    load();

    const channel = supabase
      .channel(`city_chat_reactions_${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "city_chat_message_reactions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as ReactionRow;
            setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]));
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string };
            setRows((prev) => prev.filter((r) => r.id !== old.id));
          }
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [roomId, enabled]);

  const byMessage = useMemo(() => {
    const map = new Map<string, MessageReactionSummary[]>();
    rows.forEach((r) => {
      const list = map.get(r.message_id) ?? [];
      const existing = list.find((s) => s.emoji === r.emoji);
      if (existing) {
        existing.count += 1;
        existing.mine = existing.mine || r.user_id === user?.id;
      } else {
        list.push({ emoji: r.emoji, count: 1, mine: r.user_id === user?.id });
      }
      map.set(r.message_id, list);
    });
    return map;
  }, [rows, user?.id]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;
      const existing = rows.find(
        (r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji,
      );
      if (existing) {
        setRows((prev) => prev.filter((r) => r.id !== existing.id));
        await supabase.from("city_chat_message_reactions").delete().eq("id", existing.id);
      } else {
        const { data } = await supabase
          .from("city_chat_message_reactions")
          .insert({ message_id: messageId, user_id: user.id, emoji })
          .select("id, message_id, user_id, emoji")
          .maybeSingle();
        if (data) {
          setRows((prev) => (prev.some((r) => r.id === data.id) ? prev : [...prev, data]));
        }
      }
    },
    [rows, user],
  );

  return { byMessage, toggleReaction };
};
