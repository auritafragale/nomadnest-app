import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { publicProfiles, type PublicProfile } from "@/lib/publicProfile";
import { sendNotification } from "@/lib/notifications";

const conversationsQueryKey = (userId?: string) => ["conversations", userId] as const;
const unreadMessagesQueryKey = (userId?: string) => ["unread-messages", userId] as const;

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
    queryKey: conversationsQueryKey(user?.id),
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

          // Get other user's profile (safe public view — no contact details)
          const { data: profile } = await publicProfiles("id, first_name, last_name, avatar_url")
            .eq("id", otherUserId)
            .maybeSingle() as { data: PublicProfile | null };

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

  // Subscribe to realtime messages (INSERT and UPDATE for read receipts)
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
        async (payload) => {
          console.log("New message received:", payload);
          const newMessage = payload.new as Message;
          // Add new message to cache
          queryClient.setQueryData<Message[]>(
            ["messages", conversationId],
            (old) => {
              if (!old) return [newMessage];
              // Avoid duplicates
              if (old.some((m) => m.id === newMessage.id)) {
                return old;
              }
              return [...old, newMessage];
            }
          );
          if (newMessage.sender_user_id !== user.id) {
            await supabase.rpc("mark_conversation_messages_read", {
              _conversation_id: conversationId,
            });
          }
          // Refresh conversations list for updated counts
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: unreadMessagesQueryKey(user.id) });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log("Message updated (read receipt):", payload);
          // Update message in cache with read_at
          queryClient.setQueryData<Message[]>(
            ["messages", conversationId],
            (old) => {
              if (!old) return [];
              return old.map((m) =>
                m.id === (payload.new as Message).id
                  ? { ...m, read_at: (payload.new as Message).read_at }
                  : m
              );
            }
          );
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: unreadMessagesQueryKey(user.id) });
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

      // Get conversation to find recipient and sender name
      const { data: conversation } = await supabase
        .from("conversations")
        .select("owner_user_id, sitter_user_id")
        .eq("id", conversationId)
        .single();

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single();

      if (conversation) {
        const recipientId = conversation.owner_user_id === user.id 
          ? conversation.sitter_user_id 
          : conversation.owner_user_id;

        // Send push/email notification to recipient
        sendNotification({
          type: "new_message",
          recipientUserId: recipientId,
          data: {
            senderName: [senderProfile?.first_name, senderProfile?.last_name].filter(Boolean).join(" ") || "Someone",
            messagePreview: body.substring(0, 150),
            conversationId,
          },
        });
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["messages", variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: unreadMessagesQueryKey(user?.id) });
    },
  });
};

export const useMarkAsRead = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.rpc("mark_conversation_messages_read", {
        _conversation_id: conversationId,
      });

      if (error) throw error;
    },
    onMutate: async (conversationId) => {
      if (!user) return;

      await Promise.all([
        queryClient.cancelQueries({ queryKey: conversationsQueryKey(user.id) }),
        queryClient.cancelQueries({ queryKey: unreadMessagesQueryKey(user.id) }),
        queryClient.cancelQueries({ queryKey: ["messages", conversationId] }),
      ]);

      const previousConversations = queryClient.getQueryData<Conversation[]>(
        conversationsQueryKey(user.id)
      );
      const previousUnreadCount = queryClient.getQueryData<number>(
        unreadMessagesQueryKey(user.id)
      );
      const previousMessages = queryClient.getQueryData<Message[]>(["messages", conversationId]);
      // How many unread messages this conversation contributes to the total count
      const conversationUnreadMessages = previousConversations?.find(
        (c) => c.id === conversationId
      )?.unread_count ?? 0;
      const readAt = new Date().toISOString();

      queryClient.setQueryData<Conversation[]>(conversationsQueryKey(user.id), (old) =>
        old?.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unread_count: 0 }
            : conversation
        ) ?? old
      );

      if (conversationUnreadMessages > 0) {
        queryClient.setQueryData<number>(unreadMessagesQueryKey(user.id), (old = 0) =>
          Math.max(old - conversationUnreadMessages, 0)
        );
      }

      queryClient.setQueryData<Message[]>(["messages", conversationId], (old) =>
        old?.map((message) =>
          message.sender_user_id !== user.id && !message.read_at
            ? { ...message, read_at: readAt }
            : message
        ) ?? old
      );

      return { previousConversations, previousUnreadCount, previousMessages };
    },
    onError: (_error, conversationId, context) => {
      if (!user || !context) return;

      queryClient.setQueryData(conversationsQueryKey(user.id), context.previousConversations);
      queryClient.setQueryData(unreadMessagesQueryKey(user.id), context.previousUnreadCount);
      queryClient.setQueryData(["messages", conversationId], context.previousMessages);
    },
    onSuccess: async () => {
      // Fetch real unread count after the read receipt is confirmed by the server,
      // then sync the app icon badge. Done here rather than in onMutate so the badge
      // reflects confirmed server state, and to handle the case where the user
      // navigated directly via a push notification URL (conversations not yet loaded,
      // so the optimistic decrement in onMutate is skipped).
      try {
        const { data } = await supabase.rpc("get_unread_messages_count");
        const count = data || 0;
        const nav = navigator as Navigator & {
          setAppBadge?: (n?: number) => Promise<void>;
          clearAppBadge?: () => Promise<void>;
        };
        if (nav.setAppBadge) {
          if (count > 0) {
            nav.setAppBadge(count);
          } else {
            nav.clearAppBadge?.();
          }
        }
        // Keep the cache in sync so the reactive effect in useUnreadMessages
        // doesn't contradict us on the next render.
        queryClient.setQueryData(unreadMessagesQueryKey(user?.id), count);
      } catch {
        // Badge sync failure is non-critical; leave badge as-is.
      }
    },
    onSettled: (_data, _error, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: unreadMessagesQueryKey(user?.id) });
    },
  });
};

export const useStartConversation = () => {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();

  return useMutation({
    mutationFn: async ({
      otherUserId,
      listingId,
      initialMessage,
      conversationType = "direct",
    }: {
      otherUserId: string;
      listingId?: string;
      initialMessage?: string;
      conversationType?: "direct" | "listing";
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Determine who is owner and who is sitter based on role
      const isCurrentUserOwner = role === "owner" || role === "both";
      const ownerUserId = isCurrentUserOwner ? user.id : otherUserId;
      const sitterUserId = isCurrentUserOwner ? otherUserId : user.id;

      // Check for existing conversation
      let query = supabase
        .from("conversations")
        .select("id")
        .eq("owner_user_id", ownerUserId)
        .eq("sitter_user_id", sitterUserId)
        .eq("conversation_type", conversationType);

      if (listingId) {
        query = query.eq("listing_id", listingId);
      } else {
        query = query.is("listing_id", null);
      }

      const { data: existingConvo } = await query.maybeSingle();

      let conversationId = existingConvo?.id;

      if (!conversationId) {
        const { data: newConvo, error: convoError } = await supabase
          .from("conversations")
          .insert({
            owner_user_id: ownerUserId,
            sitter_user_id: sitterUserId,
            listing_id: listingId || null,
            conversation_type: conversationType,
          })
          .select("id")
          .single();

        if (convoError) throw convoError;
        conversationId = newConvo.id;
      }


      // Send initial message if provided
      if (initialMessage && initialMessage.trim()) {
        const { error: msgError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_user_id: user.id,
          body: initialMessage,
        });

        if (msgError) throw msgError;
      }

      return { conversationId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};
