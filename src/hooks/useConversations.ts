import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveDirectConversation, resolveListingConversation } from "@/lib/conversations";

const conversationsQueryKey = (userId?: string) => ["conversations", userId] as const;
const unreadMessagesQueryKey = (userId?: string) => ["unread-messages", userId] as const;

export interface ConversationContext {
  sit_id: string | null;
  sit_status: "confirmed" | "in_progress" | "completed" | "cancelled" | null;
  sit_start: string | null;
  sit_end: string | null;
  application_status: string | null;
  invite_status: string | null;
}

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
    avatar_url: string | null;
    id_verified?: boolean;
  } | null;
  /** The other member closed their account: the chat stays, read-only. */
  member_left: boolean;
  /** The most relevant sit, application and invite for the thread's listing. */
  context: ConversationContext;
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
  /** Set when the message was sent from Ask the Nest (a Welcome Guide question). */
  guide_question_id?: string | null;
  /** Translation for the recipient (chat-translate); the sender sees the original. */
  translated_body?: string | null;
  translated_lang?: string | null;
  message_lang?: string | null;
}

type PartnerRow = {
  conversation_id: string;
  other_user_id: string | null;
  first_name: string;
  avatar_url: string | null;
  id_verified: boolean;
  member_left: boolean;
  listing_id: string | null;
  listing_title: string | null;
  listing_city: string | null;
  sit_id: string | null;
  sit_status: ConversationContext["sit_status"];
  sit_start: string | null;
  sit_end: string | null;
  application_status: string | null;
  invite_status: string | null;
  last_body: string | null;
  last_at: string | null;
  last_sender: string | null;
  unread_count: number;
};

/** Live or upcoming sit first, then a past sit, then an application or invite. */
const contextRank = (c: ConversationContext, today: string) => {
  if (c.sit_status === "confirmed" || c.sit_status === "in_progress") return (c.sit_end ?? "") >= today ? 4 : 3;
  if (c.sit_status === "completed") return 2;
  if (c.application_status || c.invite_status) return 1;
  return 0;
};

export type ConversationStatus = "Confirmed" | "Applied" | "Invited" | "Past sit";

/** The status chip on a chat row and in the header (none for direct chats). */
export const conversationStatus = (c: ConversationContext): ConversationStatus | null => {
  if (c.sit_status === "confirmed" || c.sit_status === "in_progress") return "Confirmed";
  if (c.sit_status === "completed") return "Past sit";
  if (c.application_status === "applied" || c.application_status === "shortlisted") return "Applied";
  if (c.invite_status === "pending") return "Invited";
  return null;
};

/** A sit between the two members is confirmed or under way. */
export const hasLiveSit = (c: ConversationContext) => c.sit_status === "confirmed" || c.sit_status === "in_progress";

export const useConversations = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: conversationsQueryKey(user?.id),
    queryFn: async (): Promise<Conversation[]> => {
      if (!user) return [];

      // One call: every conversation you're in, with the other member's first
      // name, avatar and ID tick whatever their visibility (chats with hidden
      // or paused members stay), the listing, sit, application and invite,
      // the last message and your unread count.
      const [{ data: rows, error }, { data: convRows, error: convError }] = await Promise.all([
        supabase.rpc("get_conversation_partners"),
        supabase
          .from("conversations")
          .select("id, listing_id, owner_user_id, sitter_user_id, created_at, updated_at, pair_thread_id")
          .or(`owner_user_id.eq.${user.id},sitter_user_id.eq.${user.id}`),
      ]);
      if (error) throw error;
      if (convError) throw convError;

      const byId = new Map((convRows ?? []).map((c) => [c.id, c]));
      const today = new Date().toISOString().slice(0, 10);

      const enriched = ((rows ?? []) as unknown as PartnerRow[]).flatMap((r) => {
        const conv = byId.get(r.conversation_id);
        if (!conv) return [];
        const context: ConversationContext = {
          sit_id: r.sit_id,
          sit_status: r.sit_status,
          sit_start: r.sit_start,
          sit_end: r.sit_end,
          application_status: r.application_status,
          invite_status: r.invite_status,
        };
        const conversation: Conversation = {
          ...conv,
          owner_user_id: conv.owner_user_id as string,
          sitter_user_id: conv.sitter_user_id as string,
          other_user: {
            id: r.other_user_id ?? "",
            first_name: r.first_name,
            avatar_url: r.avatar_url,
            id_verified: r.id_verified,
          },
          member_left: r.member_left,
          context,
          listing: r.listing_id ? { id: r.listing_id, title: r.listing_title ?? "", city: r.listing_city } : null,
          last_message: r.last_at ? { body: r.last_body ?? "", created_at: r.last_at, sender_user_id: r.last_sender ?? "" } : null,
          unread_count: r.unread_count ?? 0,
          conversation_ids: [conv.id],
          listing_contexts: [],
        };
        return [conversation];
      });

      // The Inbox shows one thread per pair of members.
      const grouped = new Map<string, Conversation>();
      const mainRank = new Map<string, number>();
      for (const conversation of enriched) {
        const key = conversation.pair_thread_id || [conversation.owner_user_id, conversation.sitter_user_id].sort().join(":");
        const existing = grouped.get(key);
        const context = conversation.listing
          ? [{ conversation_id: conversation.id, listing_id: conversation.listing.id, title: conversation.listing.title, city: conversation.listing.city }]
          : [];
        const rank = contextRank(conversation.context, today);

        if (!existing) {
          grouped.set(key, { ...conversation, id: key, conversation_ids: [conversation.id], listing_contexts: context });
          mainRank.set(key, rank);
          continue;
        }

        existing.conversation_ids.push(conversation.id);
        existing.listing_contexts.push(...context);
        existing.unread_count += conversation.unread_count;
        if ((conversation.last_message?.created_at || conversation.updated_at) > (existing.last_message?.created_at || existing.updated_at)) {
          existing.last_message = conversation.last_message;
          existing.updated_at = conversation.updated_at;
        }
        // The listing shown for the pair: one with a confirmed or upcoming sit first.
        if (rank > (mainRank.get(key) ?? 0)) {
          existing.listing = conversation.listing;
          existing.listing_id = conversation.listing_id;
          existing.context = conversation.context;
          mainRank.set(key, rank);
        }
      }

      return [...grouped.values()].sort((a, b) =>
        (b.last_message?.created_at || b.updated_at).localeCompare(a.last_message?.created_at || a.updated_at),
      );
    },
    enabled: !!user,
  });
};

/**
 * The real conversations.id new messages in this thread go to. A thread in the
 * Inbox groups every conversation between the same two members, and its own
 * `id` is only a grouping key (the pair thread id, or "owner:sitter"), never a
 * conversations row, so it must not be used for writes or storage paths.
 */
export const threadConversationId = (conversation: Conversation): string =>
  conversation.listing_contexts.find((context) => context.listing_id === conversation.listing_id)?.conversation_id ??
  conversation.conversation_ids[0];

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
            // The chat is open: its bell notification is read too.
            await supabase.rpc("mark_conversation_notifications_read", {
              p_conversation_ids: [newMessage.conversation_id],
            });
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
          }
          // A shared number may have changed.
          if (newMessage.body?.startsWith("[[phone_share]]")) {
            queryClient.invalidateQueries({ queryKey: ["phone-shares"] });
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
          const updatedMessage = payload.new as Message;
          if (!conversationIds.includes(updatedMessage.conversation_id)) return;
          // Update message in cache with read_at
          queryClient.setQueryData<Message[]>(
            ["messages", conversationIds],
            (old) => {
              if (!old) return [];
              return old.map((m) =>
                m.id === updatedMessage.id
                  ? {
                      ...m,
                      read_at: updatedMessage.read_at,
                      // The translation arrives a moment after the message.
                      translated_body: updatedMessage.translated_body,
                      translated_lang: updatedMessage.translated_lang,
                      message_lang: updatedMessage.message_lang,
                    }
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
    mutationFn: async ({
      conversationId,
      body,
      guideQuestionId,
    }: {
      conversationId: string;
      body: string;
      /** Links an Ask the Nest question (checked by the database). */
      guideQuestionId?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_user_id: user.id,
          body,
          ...(guideQuestionId ? { guide_question_id: guideQuestionId } : {}),
        })
        .select()
        .single();

      if (error) throw error;

      // conversations.updated_at is bumped by a database trigger on each
      // message, and the other member's bell, push and email come from the
      // notify_new_message trigger: nothing here depends on this browser's
      // sign-in still being valid once the message is saved.

      return data;
    },
    onSuccess: () => {
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
      // Opening a chat also clears its new-message notifications in the bell.
      const { error: notifError } = await supabase.rpc("mark_conversation_notifications_read", {
        p_conversation_ids: conversationIds,
      });
      if (notifError) throw notifError;
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
    // The app badge follows the refreshed counts (UnreadSync owns it).
    onSettled: (_data, _error, conversationIds) => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationIds] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: unreadMessagesQueryKey(user?.id) });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
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
