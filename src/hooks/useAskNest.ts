import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSendMessage } from "@/hooks/useConversations";
import { resolveListingConversation } from "@/lib/conversations";

const CLIENT_TIMEOUT_MS = 25_000; // a little longer than the function's 20s
const FRIENDLY_ERROR = "Sorry, I couldn't answer that right now. Please try again in a moment.";

export interface AskNestReply {
  emergency?: boolean;
  answer?: string;
  answered_from_guide?: boolean;
  photo_ids?: string[];
  question_id?: string | null;
  remaining?: number;
}

/** Ask the Nest is behind app_settings.ask_nest_enabled; admins can use it while it's off. */
export const useAskNestAvailable = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { data: flagEnabled = false } = useQuery({
    queryKey: ["app-setting", "ask_nest_enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "ask_nest_enabled").maybeSingle();
      return data?.value === true;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  return !!user && (flagEnabled || isAdmin === true);
};

export const askTheNest = async (listingId: string, question: string): Promise<AskNestReply> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const { data, error } = await supabase.functions.invoke<AskNestReply>("ask-the-nest", {
      body: { listing_id: listingId, question },
      signal: controller.signal,
    });
    if (controller.signal.aborted) throw new Error("That took longer than usual. Please try again in a moment.");
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => null);
        throw new Error(body?.error || FRIENDLY_ERROR);
      }
      throw new Error(FRIENDLY_ERROR);
    }
    return data ?? {};
  } catch (err) {
    if (controller.signal.aborted) throw new Error("That took longer than usual. Please try again in a moment.");
    throw err instanceof Error ? err : new Error(FRIENDLY_ERROR);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Sends a message into the existing chat between this listing's owner and
 * sitter (the normal message notifications follow), and optionally records
 * that the guide question was sent.
 */
export const useSendGuideChatMessage = () => {
  const sendMessage = useSendMessage();
  return useMutation({
    mutationFn: async ({
      listingId,
      ownerUserId,
      sitterUserId,
      body,
      questionId,
    }: {
      listingId: string;
      ownerUserId: string;
      sitterUserId: string;
      body: string;
      questionId?: string | null;
    }) => {
      const conversationId = await resolveListingConversation({ listingId, ownerUserId, sitterUserId });
      if (!conversationId) throw new Error("Couldn't open your chat. Please try again.");
      await sendMessage.mutateAsync({ conversationId, body, guideQuestionId: questionId ?? null });
      if (questionId) {
        await supabase.rpc("mark_guide_question_asked", { p_question_id: questionId });
      }
      return conversationId;
    },
  });
};

// ─── Owner side ──────────────────────────────────────────────────────────────

export interface GuideQuestion {
  id: string;
  sitter_user_id: string;
  question: string;
  answered_from_guide: boolean;
  is_emergency: boolean;
  asked_owner_at: string | null;
  owner_answer: string | null;
  added_to_guide: boolean;
  dismissed_at: string | null;
  /** Set when Ask the Nest grouped this as a repeat of another open question. */
  parent_question_id: string | null;
  created_at: string;
  /** When the sit ended (or was cancelled); null if unknown. */
  sit_ended_at: string | null;
}

export interface GuideQa {
  id: string;
  question: string;
  answer: string;
  arrival_only: boolean;
}

/**
 * The owner's unanswered sitter questions (open and dismissed), newest first.
 * The server leaves out anything Ask the Nest answered from the guide.
 */
export const useOwnerGuideQuestions = (listingId: string | undefined) =>
  useQuery({
    queryKey: ["guide-questions", listingId],
    queryFn: async (): Promise<GuideQuestion[]> => {
      const { data, error } = await supabase.rpc("get_owner_guide_questions", { p_listing_id: listingId! });
      if (error) throw error;
      return ((data ?? []) as unknown as GuideQuestion[]).filter((q) => !q.answered_from_guide && !q.owner_answer);
    },
    enabled: !!listingId,
  });

/** "Dismiss" / "Don't add" and "Restore". Applies to the question's whole group. */
export const useSetGuideQuestionDismissed = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ questionId, dismissed }: { questionId: string; dismissed: boolean }) => {
      const { data, error } = await supabase.rpc("set_guide_question_dismissed", {
        p_question_id: questionId,
        p_dismissed: dismissed,
      });
      if (error) throw new Error(error.message);
      return data as { listing_id: string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["linked-guide-questions"] });
      queryClient.invalidateQueries({ queryKey: ["guide-questions", result?.listing_id] });
    },
  });
};

export const useGuideQa = (listingId: string | undefined) =>
  useQuery({
    queryKey: ["guide-qa", listingId],
    queryFn: async (): Promise<GuideQa[]> => {
      const { data, error } = await supabase
        .from("guide_qa")
        .select("id, question, answer, arrival_only")
        .eq("listing_id", listingId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as GuideQa[];
    },
    enabled: !!listingId,
  });

export const useGuideQaActions = (listingId: string | undefined) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const sendChat = useSendGuideChatMessage();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["guide-questions", listingId] });
    queryClient.invalidateQueries({ queryKey: ["guide-qa", listingId] });
  };

  /** Save to the guide, then send the answer to the sitter in chat. */
  const answer = useMutation({
    mutationFn: async ({ questionId, text, arrivalOnly }: { questionId: string; text: string; arrivalOnly: boolean }) => {
      if (!listingId || !user) throw new Error("Please sign in again.");
      const { data, error } = await supabase.rpc("answer_guide_question", {
        p_question_id: questionId,
        p_answer: text,
        p_arrival_only: arrivalOnly,
      });
      if (error) throw new Error(error.message);
      const result = data as {
        sitter_user_id: string;
        question: string;
        sitter_arrival_open: boolean;
        sitters?: { sitter_user_id: string; has_access: boolean; sitter_arrival_open: boolean }[];
      };
      // The sitter who asked this question hears back as before; other sitters
      // in the same group only while their sit is on.
      const sitters = [
        { sitter_user_id: result.sitter_user_id, sitter_arrival_open: result.sitter_arrival_open },
        ...(result.sitters ?? []).filter((s) => s.sitter_user_id !== result.sitter_user_id && s.has_access),
      ];
      let chatSent = false;
      for (const sitter of sitters) {
        // Never send an arrival-only answer in chat before the sitter's window opens.
        const body =
          arrivalOnly && !sitter.sitter_arrival_open
            ? `I've answered your Welcome Guide question: "${result.question}". You'll see the answer in the guide when your arrival details unlock.`
            : `Answer to your Welcome Guide question: "${result.question}"\n${text.trim()}`;
        try {
          await sendChat.mutateAsync({ listingId, ownerUserId: user.id, sitterUserId: sitter.sitter_user_id, body });
          chatSent = true;
        } catch {
          /* the answer is saved; chat is best effort */
        }
      }
      return { chatSent };
    },
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: async ({ id, text, arrivalOnly }: { id: string; text: string; arrivalOnly: boolean }) => {
      const { error } = await supabase.from("guide_qa").update({ answer: text.trim(), arrival_only: arrivalOnly }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("guide_qa").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return { answer, update, remove };
};

// ─── Chat: questions linked to messages ──────────────────────────────────────

export interface LinkedGuideQuestion {
  id: string;
  listing_id: string;
  question: string;
  is_emergency: boolean;
  answered_from_guide: boolean;
  owner_answer: string | null;
  dismissed_at: string | null;
}

/** The Ask the Nest questions linked to messages in a chat (sitter: own; owner: their listings'). */
export const useLinkedGuideQuestions = (ids: string[]) =>
  useQuery({
    queryKey: ["linked-guide-questions", [...ids].sort().join(",")],
    queryFn: async (): Promise<LinkedGuideQuestion[]> => {
      const { data, error } = await supabase
        .from("guide_questions")
        .select("id, listing_id, question, is_emergency, answered_from_guide, owner_answer, dismissed_at")
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as LinkedGuideQuestion[];
    },
    enabled: ids.length > 0,
  });

/**
 * Saves the owner's chat reply to the guide. No chat message is sent: the
 * answer is already in the conversation. answer_guide_question still checks
 * that the caller owns the listing.
 */
export const useSaveGuideAnswerFromChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ questionId, text, arrivalOnly }: { questionId: string; text: string; arrivalOnly: boolean }) => {
      const { data, error } = await supabase.rpc("answer_guide_question", {
        p_question_id: questionId,
        p_answer: text,
        p_arrival_only: arrivalOnly,
      });
      if (error) throw new Error(error.message);
      return data as { listing_id: string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["linked-guide-questions"] });
      queryClient.invalidateQueries({ queryKey: ["guide-questions", result?.listing_id] });
      queryClient.invalidateQueries({ queryKey: ["guide-qa", result?.listing_id] });
    },
  });
};
