import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Conversation {
  id: string;
  listing_id: string | null;
  owner_user_id: string;
  sitter_user_id: string;
  created_at: string;
  updated_at: string;
  other_user: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
  listing?: {
    id: string;
    title: string;
    city: string | null;
  } | null;
  last_message?: {
    body: string;
    created_at: string;
    sender_user_id: string;
  } | null;
  unread_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export const useConversations = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async (): Promise<Conversation[]> => {
      if (!user) return [];

      const { data: conversations, error } = await supabase
        .from("conversations")
        .select(`
          *,
          listings:listing_id (id, title, city)
        `)
        .or(`owner_user_id.eq.${user.id},sitter_user_id.eq.${user.id}`)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Fetch other user profiles and last messages
      const enrichedConversations = await Promise.all(
        (conversations || []).map(async (conv) => {
          const otherUserId = conv.owner_user_id === user.id 
            ? conv.sitter_user_id 
            : conv.owner_user_id;

          // Get other user's profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url")
            .eq("id", otherUserId)
            .single();

          // Get last message
          const { data: messages } = await supabase
            .from("messages")
            .select("body, created_at, sender_user_id")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1);

          // Get unread count
          const { count } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .neq("sender_user_id", user.id)
            .is("read_at", null);

          return {
            ...conv,
            other_user: profile,
            listing: conv.listings,
            last_message: messages?.[0] || null,
            unread_count: count || 0,
          };
        })
      );

      return enrichedConversations;
    },
    enabled: !!user,
  });
};

export const useMessages = (conversationId: string | null) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Subscribe to realtime messages
  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log("New message received:", payload);
          // Add new message to cache
          queryClient.setQueryData<Message[]>(
            ["messages", conversationId],
            (old) => {
              if (!old) return [payload.new as Message];
              // Avoid duplicates
              if (old.some((m) => m.id === (payload.new as Message).id)) {
                return old;
              }
              return [...old, payload.new as Message];
            }
          );
          // Refresh conversations list for updated counts
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user, queryClient]);

  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async (): Promise<Message[]> => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!conversationId && !!user,
  });
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId: string; body: string }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_user_id: user.id,
          body,
        })
        .select()
        .single();

      if (error) throw error;

      // Update conversation's updated_at
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["messages", variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useMarkAsRead = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .neq("sender_user_id", user.id)
        .is("read_at", null);

      if (error) throw error;
    },
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};
