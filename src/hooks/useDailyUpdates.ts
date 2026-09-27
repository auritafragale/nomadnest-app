import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSendMessage } from "@/hooks/useConversations";
import { buildDailyUpdateMessageBody } from "@/hooks/useSitCheckins";
import { resolveListingConversation } from "@/lib/conversations";
import { sendNotification } from "@/lib/notifications";
import { resizeImage } from "@/lib/imageResize";
import { UPDATE_PHOTO_BUCKET, type UpdateChip } from "@/lib/dailyUpdate";

export interface SitUpdateContext {
  sit_id: string;
  status: "confirmed" | "in_progress" | "completed" | "cancelled";
  role: "sitter" | "owner";
  listing_id: string;
  listing_title: string;
  owner_user_id: string;
  sitter_user_id: string;
  timezone: string;
  today: string;
  start_date: string;
  end_date: string;
  total_days: number;
  day_number: number | null;
  can_post: boolean;
  owner: { first_name: string; avatar_url: string | null };
  sitter: { first_name: string; avatar_url: string | null };
  pets: { name: string | null; type: string | null; photo: string | null; needs_medication: boolean }[];
}

/** Everything the progress header needs; null if the caller isn't on this sit. */
export const useSitUpdateContext = (sitId: string | undefined) =>
  useQuery({
    queryKey: ["sit-update-context", sitId],
    queryFn: async (): Promise<SitUpdateContext | null> => {
      const { data, error } = await supabase.rpc("get_sit_update_context", { p_sit_id: sitId! });
      if (error) throw error;
      return (data ?? null) as unknown as SitUpdateContext | null;
    },
    enabled: !!sitId,
    staleTime: 60_000,
  });

/** Shrinks and uploads one photo to the private bucket; returns its path. */
export const uploadUpdatePhoto = async (sitId: string, file: File): Promise<string> => {
  const looksLikeImage = file.type.startsWith("image/") || !file.type || file.type === "application/octet-stream";
  if (!looksLikeImage) throw new Error("Please choose a photo.");
  const blob = await resizeImage(file, 1600, 0.82);
  const path = `${sitId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(UPDATE_PHOTO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error("That photo didn't upload. Please try again.");
  return path;
};

/** Best effort: removes a photo the sitter took out before sending. */
export const removeUpdatePhoto = async (path: string) => {
  await supabase.storage.from(UPDATE_PHOTO_BUCKET).remove([path]).catch(() => undefined);
};

/** Signed URLs (1 hour) for private update photos, in one request. */
export const useUpdatePhotoUrls = (paths: string[]) => {
  const unique = [...new Set(paths)].sort();
  return useQuery({
    queryKey: ["sit-update-photo-urls", unique.join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from(UPDATE_PHOTO_BUCKET).createSignedUrls(unique, 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
      }
      return map;
    },
    enabled: unique.length > 0,
    staleTime: 50 * 60 * 1000,
  });
};

// ─── AI ──────────────────────────────────────────────────────────────────────

const AI_CLIENT_TIMEOUT_MS = 30_000; // a little longer than the function's 25s

/** AI Daily Updates is behind app_settings.daily_update_ai_enabled; admins can use it while it's off. */
export const useDailyUpdateAiAvailable = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { data: flagEnabled = false } = useQuery({
    queryKey: ["app-setting", "daily_update_ai_enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "daily_update_ai_enabled").maybeSingle();
      return data?.value === true;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  return !!user && (flagEnabled || isAdmin === true);
};

const invokeDailyUpdateAi = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_CLIENT_TIMEOUT_MS);
  try {
    const { data, error } = await supabase.functions.invoke<T>("daily-update-ai", { body, signal: controller.signal });
    if (controller.signal.aborted) throw new Error("That took longer than usual. Please try again in a moment.");
    if (error) {
      const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
      throw new Error(detail?.error || "Sorry, that didn't work right now. Please try again in a moment.");
    }
    return data as T;
  } catch (err) {
    if (controller.signal.aborted) throw new Error("That took longer than usual. Please try again in a moment.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

export const draftDailyUpdate = (input: {
  sitId: string;
  photoPaths: string[];
  chips: UpdateChip[];
  note: string;
  flagNote: string;
}) =>
  invokeDailyUpdateAi<{ text: string; remaining?: number }>({
    action: "draft",
    sit_id: input.sitId,
    photo_paths: input.photoPaths,
    chips: input.chips,
    note: input.note,
    flag_note: input.flagNote,
  });

// ─── Send ────────────────────────────────────────────────────────────────────

/**
 * Sends today's update: the row (checked by the database), the card in the
 * sit's chat, then the email/push to the owner. Translation for the owner
 * runs afterwards and never blocks the sitter.
 */
export const useSendDailyUpdate = (context: SitUpdateContext | null | undefined) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const aiAvailable = useDailyUpdateAiAvailable();

  return useMutation({
    mutationFn: async (input: {
      chips: UpdateChip[];
      photoPaths: string[];
      note: string;
      flagNote: string;
      aiDrafted: boolean;
    }) => {
      if (!context || !user) throw new Error("Please sign in again.");
      const flagged = input.chips.includes("flag");
      const note = input.note.trim() || null;
      const flagNote = flagged ? input.flagNote.trim() || null : null;

      const { data: row, error } = await supabase
        .from("sit_checkins")
        .insert({
          sit_id: context.sit_id,
          author_user_id: user.id,
          kind: "daily_update",
          chips: input.chips,
          photo_paths: input.photoPaths,
          note,
          flag_note: flagNote,
          ai_drafted: input.aiDrafted,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      // Mirror into the one chat thread for this home. The update is saved
      // either way; the owner is also notified by the database trigger.
      let conversationId: string | null = null;
      try {
        conversationId = await resolveListingConversation({
          listingId: context.listing_id,
          ownerUserId: context.owner_user_id,
          sitterUserId: user.id,
        });
        if (conversationId) {
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_user_id: user.id,
            body: buildDailyUpdateMessageBody({
              checkinId: row.id,
              chips: input.chips,
              photoPaths: input.photoPaths,
              flagged,
              note,
              flagNote,
            }),
          });
          await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
        }
      } catch (err) {
        console.error("Posting the update card to chat failed", err);
      }

      sendNotification({
        type: "sit_checkin",
        recipientUserId: context.owner_user_id,
        skipInAppNotification: true,
        data: {
          sitterName: context.sitter.first_name,
          listingTitle: context.listing_title,
          checkinLabel: flagged ? "Today's update, with a note for you" : "Today's update",
          note: (flagged ? flagNote || note : note) ?? "",
          url: `/sits/${context.sit_id}`,
          sit_id: context.sit_id,
        },
      });

      if (aiAvailable) {
        invokeDailyUpdateAi({ action: "translate", checkin_id: row.id })
          .then(() => queryClient.invalidateQueries({ queryKey: ["sit-checkins", context.sit_id] }))
          .catch(() => undefined);
      }
      return row.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sit-checkins", context?.sit_id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["active-sit-for-conversation"] });
    },
  });
};

// ─── Owner: heart and reply ──────────────────────────────────────────────────

export const useToggleCheckinHeart = (sitId: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (checkinId: string) => {
      const { data, error } = await supabase.rpc("toggle_checkin_heart", { p_checkin_id: checkinId });
      if (error) throw new Error(error.message);
      return data as { hearted: boolean };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sit-checkins", sitId] }),
  });
};

/** A reply to an update goes into the existing chat for this home. */
export const useReplyToUpdate = (context: SitUpdateContext | null | undefined) => {
  const sendMessage = useSendMessage();
  return useMutation({
    mutationFn: async (text: string) => {
      if (!context) throw new Error("Please try again.");
      const conversationId = await resolveListingConversation({
        listingId: context.listing_id,
        ownerUserId: context.owner_user_id,
        sitterUserId: context.sitter_user_id,
      });
      if (!conversationId) throw new Error("Couldn't open your chat. Please try again.");
      await sendMessage.mutateAsync({ conversationId, body: text.trim() });
      return conversationId;
    },
  });
};

// ─── Preferred language ──────────────────────────────────────────────────────

export const useMyPreferredLanguage = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["preferred-language", user?.id],
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase.from("profiles").select("preferred_language").eq("id", user!.id).maybeSingle();
      return (data?.preferred_language as string | null) ?? null;
    },
    enabled: !!user,
  });
};

export const useSetPreferredLanguage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (language: string | null) => {
      const { data, error } = await supabase.rpc("set_my_preferred_language", {
        p_language: language ?? "",
        p_only_if_empty: false,
      });
      if (error) throw new Error(error.message);
      return data as string | null;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["preferred-language", user?.id] }),
  });
};
