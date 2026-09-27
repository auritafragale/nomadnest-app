import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Old one-tap check-in kinds (still shown in timelines and chat). */
export type CheckinKind = "pets_fed" | "meds_given" | "walk_completed";

export const CHECKIN_LABELS: Record<CheckinKind, string> = {
  pets_fed: "Pets Fed",
  meds_given: "Meds Given",
  walk_completed: "Walk Completed",
};

/** One row per update: today's updates (kind "daily_update") and older check-ins. */
export interface SitCheckin {
  id: string;
  sit_id: string;
  author_user_id: string;
  kind: CheckinKind | "note" | "daily_update";
  note: string | null;
  photo_url: string | null;
  created_at: string;
  chips: string[];
  flagged: boolean;
  flag_note: string | null;
  photo_paths: string[];
  local_day: string | null;
  ai_drafted: boolean;
  message_lang: string | null;
  translated_message: string | null;
  translated_flag_note: string | null;
  translated_lang: string | null;
  owner_heart_at: string | null;
}

/**
 * Machine-readable marker written into the mirrored conversation message so
 * the chat can render a card instead of raw text.
 *
 * Today's update: `[[checkin]]{"kind":"daily_update","checkin_id":"…","chips":[…],"photos":["{sit_id}/…"],"flagged":false,"note":"…","flag_note":null}`
 * Older check-ins: `[[checkin]]{"kind":"pets_fed","label":"Pets Fed","note":"…","photo":"…"}`
 * Photos of today's updates are paths in the private sit-update-photos bucket.
 */
const CHECKIN_MARKER = "[[checkin]]";

export interface CheckinMessage {
  kind: string;
  label?: string;
  note: string | null;
  photo?: string | null;
  checkin_id?: string;
  chips?: string[];
  photos?: string[];
  flagged?: boolean;
  flag_note?: string | null;
}

export const buildDailyUpdateMessageBody = (update: {
  checkinId: string;
  chips: string[];
  photoPaths: string[];
  flagged: boolean;
  note: string | null;
  flagNote: string | null;
}): string =>
  `${CHECKIN_MARKER}${JSON.stringify({
    kind: "daily_update",
    label: "Today's update",
    checkin_id: update.checkinId,
    chips: update.chips,
    photos: update.photoPaths,
    flagged: update.flagged,
    note: update.note,
    flag_note: update.flagNote,
  })}`;

export const parseCheckinMessage = (body: string): CheckinMessage | null => {
  if (!body || !body.startsWith(CHECKIN_MARKER)) return null;
  try {
    const json = JSON.parse(body.slice(CHECKIN_MARKER.length));
    if (json && typeof json.kind === "string") return json as CheckinMessage;
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
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []) as SitCheckin[];
    },
    enabled: !!sitId,
  });
