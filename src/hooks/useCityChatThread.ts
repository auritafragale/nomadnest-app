import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ThreadSender {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface ThreadReply {
  id: string;
  room_id: string;
  sender_user_id: string;
  content: string;
  created_at: string;
  sender?: ThreadSender | null;
}

const hydrate = async (rows: ThreadReply[]): Promise<ThreadReply[]> => {
  const ids = Array.from(new Set(rows.map((r) => r.sender_user_id)));
  if (ids.length === 0) return rows;
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, avatar_url")
    .in("id", ids);
  const map = new Map((data || []).map((p) => [p.id, p as ThreadSender]));
  return rows.map((r) => ({ ...r, sender: map.get(r.sender_user_id) || null }));
};

/**
 * Replies for one parent city chat message, kept live.
 */
export const useCityChatThread = (roomId: string | undefined, parentId: string | null) => {
  const { user } = useAuth();
  const [replies, setReplies] = useState<ThreadReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!parentId) {
      setReplies([]);
      return;
    }
    let mounted = true;
    setLoading(true);

    const load = async () => {
      const { data } = await supabase
        .from("city_chat_messages")
        .select("id, room_id, sender_user_id, content, created_at")
        .eq("parent_message_id", parentId)
        .order("created_at", { ascending: true });
      const hydrated = await hydrate((data || []) as ThreadReply[]);
      if (mounted) {
        setReplies(hydrated);
        setLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`city_chat_thread_${parentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "city_chat_messages",
          filter: `parent_message_id=eq.${parentId}`,
        },
        async (payload) => {
          const [row] = await hydrate([payload.new as ThreadReply]);
          setReplies((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [parentId]);

  const sendReply = useCallback(
    async (content: string) => {
      if (!roomId || !parentId || !user || !content.trim()) return false;
      setSending(true);
      const { error } = await supabase.from("city_chat_messages").insert({
        room_id: roomId,
        sender_user_id: user.id,
        content: content.trim(),
        parent_message_id: parentId,
      });
      setSending(false);
      return !error;
    },
    [roomId, parentId, user],
  );

  return { replies, loading, sending, sendReply };
};
