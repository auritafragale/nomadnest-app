import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { publicProfiles, type PublicProfile } from "@/lib/publicProfile";
import { sendNotification } from "@/lib/notifications";
import { messagePreviewText } from "@/lib/chatImage";
import { resolveDirectConversation, resolveListingConversation } from "@/lib/conversations";

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
  pair_thread_id: string | null;
  conversation_ids: string[];
  listing_contexts: Array<{ conversation_id: string; listing_id: string; title: string; city: string | null }>;
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

      const grouped = new Map<string, Conversation>();
      for (const conversation of enrichedConversations) {
        const key = conversation.pair_thread_id || [conversation.owner_user_id, conversation.sitter_user_id].sort().join(":");
        const existing = grouped.get(key);
        const context = conversation.listing
          ? [{ conversation_id: conversation.id, listing_id: conversation.listing.id, title: conversation.listing.title, city: conversation.listing.city }]
          : [];

        if (!existing) {
          grouped.set(key, {
            ...conversation,
            id: key,
            conversation_ids: [conversation.id],
            listing_contexts: context,
          });
          continue;
        }

        existing.conversation_ids.push(conversation.id);
        existing.listing_contexts.push(...context);
        existing.unread_count += conversation.unread_count;
        if ((conversation.last_message?.created_at || conversation.updated_at) > (existing.last_message?.created_at || existing.updated_at)) {
          existing.last_message = conversation.last_message;
          existing.updated_at = conversation.updated_at;
          existing.listing = conversation.listing;
          existing.listing_id = conversation.listing_id;
        }
      }

      return [...grouped.values()].sort((a, b) =>
        (b.last_message?.created_at || b.updated_at).localeCompare(a.last_message?.created_at || a.updated_at),
      );
    },
    enabled: !!user,
  });
};

export const useMessages = (conversationIds: string[]) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Subscribe to realtime messages (INSERT and UPDATE for read receipts)
  useEffect(() => {
    if (conversationIds.length === 0 || !user) return;

    const channel = supabase
      .channel(`messages:${conversationIds.slice().sort().join(":")}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          console.log("New message received:", payload);
          const newMessage = payload.new as Message;
          if (!conversationIds.includes(newMessage.conversation_id)) return;
          // Add new message to cache
          queryClient.setQueryData<Message[]>(
            ["messages", conversationIds],
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
              _conversation_id: newMessage.conversation_id,
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
        },
        (payload) => {
          console.log("Message updated (read receipt):", payload);
          const updatedMessage = payload.new as Message;
          if (!conversationIds.includes(updatedMessage.conversation_id)) return;
          // Update message in cache with read_at
          queryClient.setQueryData<Message[]>(
            ["messages", conversationIds],
            (old) => {
              if (!old) return [];
              return old.map((m) =>
                m.id === updatedMessage.id
                  ? { ...m, read_at: updatedMessage.read_at }
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
  }, [conversationIds.join("|"), user, queryClient]);

  return useQuery({
    queryKey: ["messages", conversationIds],
    queryFn: async (): Promise<Message[]> => {
      if (conversationIds.length === 0) return [];

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: conversationIds.length > 0 && !!user,
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
            messagePreview: messagePreviewText(body).substring(0, 150),
            conversationId,
          },
        });
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: unreadMessagesQueryKey(user?.id) });
    },
  });
};

export const useMarkAsRead = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (conversationIds: string[]) => {
      if (!user) throw new Error("Not authenticated");

      for (const conversationId of conversationIds) {
        const { error } = await supabase.rpc("mark_conversation_messages_read", { _conversation_id: conversationId });
        if (error) throw error;
      }
    },
    onMutate: async (conversationIds) => {
      if (!user) return;

      await Promise.all([
        queryClient.cancelQueries({ queryKey: conversationsQueryKey(user.id) }),
        queryClient.cancelQueries({ queryKey: unreadMessagesQueryKey(user.id) }),
        queryClient.cancelQueries({ queryKey: ["messages", conversationIds] }),
      ]);

      const previousConversations = queryClient.getQueryData<Conversation[]>(
        conversationsQueryKey(user.id)
      );
      const previousUnreadCount = queryClient.getQueryData<number>(
        unreadMessagesQueryKey(user.id)
      );
      const previousMessages = queryClient.getQueryData<Message[]>(["messages", conversationIds]);
      // How many unread messages this conversation contributes to the total count
      const conversationUnreadMessages = previousConversations?.find(
        (c) => c.conversation_ids.some((id) => conversationIds.includes(id))
      )?.unread_count ?? 0;
      const readAt = new Date().toISOString();

      queryClient.setQueryData<Conversation[]>(conversationsQueryKey(user.id), (old) =>
        old?.map((conversation) =>
          conversation.conversation_ids.some((id) => conversationIds.includes(id))
            ? { ...conversation, unread_count: 0 }
            : conversation
        ) ?? old
      );

      if (conversationUnreadMessages > 0) {
        queryClient.setQueryData<number>(unreadMessagesQueryKey(user.id), (old = 0) =>
          Math.max(old - conversationUnreadMessages, 0)
        );
      }

      queryClient.setQueryData<Message[]>(["messages", conversationIds], (old) =>
        old?.map((message) =>
          message.sender_user_id !== user.id && !message.read_at
            ? { ...message, read_at: readAt }
            : message
        ) ?? old
      );

      return { previousConversations, previousUnreadCount, previousMessages };
    },
    onError: (_error, conversationIds, context) => {
      if (!user || !context) return;

      queryClient.setQueryData(conversationsQueryKey(user.id), context.previousConversations);
      queryClient.setQueryData(unreadMessagesQueryKey(user.id), context.previousUnreadCount);
      queryClient.setQueryData(["messages", conversationIds], context.previousMessages);
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
    onSettled: (_data, _error, conversationIds) => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationIds] });
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

      // For a home chat the Pet Parent side is always the home's owner, so the
      // thread is identical no matter who opens it. For a person-to-person chat
      // we fall back to the current member's mode for the row's orientation.
      let ownerUserId: string;
      let sitterUserId: string;

      if (listingId) {
        const { data: listing } = await supabase
          .from("listings")
          .select("owner_user_id")
          .eq("id", listingId)
          .maybeSingle();
        ownerUserId = listing?.owner_user_id ?? user.id;
        sitterUserId = ownerUserId === user.id ? otherUserId : user.id;
      } else {
        const isCurrentUserOwner = role === "owner" || role === "both";
        ownerUserId = isCurrentUserOwner ? user.id : otherUserId;
        sitterUserId = isCurrentUserOwner ? otherUserId : user.id;
      }

      const conversationId = listingId
        ? await resolveListingConversation({ listingId, ownerUserId, sitterUserId })
        : await resolveDirectConversation({ ownerUserId, sitterUserId });

      if (!conversationId) throw new Error("Could not open the conversation");



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
