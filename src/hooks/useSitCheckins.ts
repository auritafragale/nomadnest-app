import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { resolveListingConversation } from "@/lib/conversations";
import { sendNotification } from "@/lib/notifications";

export type CheckinKind = "pets_fed" | "meds_given" | "walk_completed";

export const CHECKIN_LABELS: Record<CheckinKind, string> = {
  pets_fed: "Pets Fed",
  meds_given: "Meds Given",
  walk_completed: "Walk Completed",
};

export interface SitCheckin {
  id: string;
  sit_id: string;
  author_user_id: string;
  kind: CheckinKind;
  note: string | null;
  photo_url: string | null;
  created_at: string;
}

/**
 * Machine-readable marker written into the mirrored conversation message so
 * the chat can render a care card instead of raw text. Kept compact and
 * parseable without string-sniffing prose.
 *
 * Format: `[[checkin]]{"kind":"pets_fed","label":"Pets Fed","note":"...","photo":"..."}`
 */
const CHECKIN_MARKER = "[[checkin]]";

export const buildCheckinMessageBody = (
  kind: CheckinKind,
  note?: string,
  photoUrl?: string | null,
): string => {
  const payload = {
    kind,
    label: CHECKIN_LABELS[kind],
    note: note?.trim() || null,
    photo: photoUrl || null,
  };
  return `${CHECKIN_MARKER}${JSON.stringify(payload)}`;
};

export const parseCheckinMessage = (
  body: string,
): { kind: CheckinKind; label: string; note: string | null; photo: string | null } | null => {
  if (!body || !body.startsWith(CHECKIN_MARKER)) return null;
  try {
    const json = JSON.parse(body.slice(CHECKIN_MARKER.length));
    if (json && typeof json.kind === "string") {
      return json as { kind: CheckinKind; label: string; note: string | null; photo: string | null };
    }
  } catch {
    // Not a valid check-in message.
  }
  return null;
};

export const useSitCheckins = (sitId: string | undefined) =>
  useQuery({
    queryKey: ["sit-checkins", sitId],
    queryFn: async (): Promise<SitCheckin[]> => {
      if (!sitId) return [];
      const { data, error } = await supabase
        .from("sit_checkins")
        .select("*")
        .eq("sit_id", sitId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SitCheckin[];
    },
    enabled: !!sitId,
  });

export const useAddSitCheckin = (sitId: string | undefined) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kind,
      note,
      photoUrl,
      ownerUserId,
      listingId,
    }: {
      kind: CheckinKind;
      note?: string;
      photoUrl?: string | null;
      ownerUserId: string;
      listingId: string | null;
    }) => {
      if (!sitId || !user) throw new Error("Not authenticated");

      const { error } = await supabase.from("sit_checkins").insert({
        sit_id: sitId,
        author_user_id: user.id,
        kind,
        note: note?.trim() || null,
        photo_url: photoUrl || null,
      });
      if (error) throw error;

      // Mirror the update into the one chat thread for this sit's home.
      // This must succeed — a check-in the Pet Parent never sees is no
      // check-in at all.
      const body = buildCheckinMessageBody(kind, note, photoUrl);
      const conversationId = await resolveListingConversation({
        listingId,
        ownerUserId,
        sitterUserId: user.id,
      });

      if (!conversationId) {
        throw new Error("Could not open the sit chat to post the update.");
      }

      const { error: mirrorError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_user_id: user.id,
        body,
      });
      if (mirrorError) throw mirrorError;

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      // The Pet Parent's in-app notification is created by a database
      // trigger; here we add push + email (respecting their settings).
      const [{ data: listing }, { data: sitterProfile }] = await Promise.all([
        supabase.from("listings").select("title").eq("id", listingId).single(),
        supabase.from("profiles").select("first_name, last_name").eq("id", user.id).single(),
      ]);
      sendNotification({
        type: "sit_checkin",
        recipientUserId: ownerUserId,
        skipInAppNotification: true,
        data: {
          sitterName: [sitterProfile?.first_name, sitterProfile?.last_name].filter(Boolean).join(" ") || "Your Nomad",
          listingTitle: listing?.title || "your sit",
          checkinLabel: CHECKIN_LABELS[kind],
          note: note?.trim() || "",
          url: `/inbox?conversation=${conversationId}`,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sit-checkins", sitId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["active-sit-for-conversation"] });
      toast.success("Check-in posted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not post the check-in");
    },
  });
};
