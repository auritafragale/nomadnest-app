import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { clearGuideCache, readGuideCache, writeGuideCache } from "@/lib/guideCache";
import type { GuideSection } from "@/lib/welcomeGuide";

export interface SitterGuidePet {
  id: string;
  name: string | null;
  type: string;
  age: string | null;
  personality: string | null;
  feeding_details: string | null;
  walks_exercise: string | null;
  daily_routine: string | null;
  requires_medication: boolean | null;
  has_medication: boolean | null;
  medication_instructions: string | null;
  behaviour_notes: string | null;
  vet_info: string | null;
}

export interface SitterGuidePhoto {
  id: string;
  section: GuideSection;
  pet_id: string | null;
  note: string | null;
  instruction: string | null;
  storage_path: string;
}

/** Exactly what get_sitter_guide returns (section d only while unlocked). */
export interface SitterGuide {
  listing_id: string;
  listing_title: string;
  address: string | null;
  sit_id: string;
  timezone: string;
  unlock_at: string;
  ends_at: string;
  access_open: boolean;
  guide: Record<string, unknown> & { na_fields?: string[] } | null;
  access: {
    key_handover: string | null;
    door_codes: string | null;
    alarm_instructions: string | null;
    wifi_details: string | null;
    na_fields: string[];
  } | null;
  pets: SitterGuidePet[];
  photos: SitterGuidePhoto[];
  /** Added in Stage 3 (older cached copies may not have them). */
  owner_user_id?: string;
  owner_first_name?: string;
  qa?: { id: string; question: string; answer: string; arrival_only: boolean }[];
}

/**
 * The confirmed sitter's guide for one listing, from get_sitter_guide.
 * Falls back to the offline copy only when the network call fails; a "no
 * access" answer clears the offline copy.
 */
export const useSitterGuide = (listingId: string | undefined, enabled = true) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["sitter-guide", listingId, user?.id],
    queryFn: async (): Promise<{ guide: SitterGuide | null; fromCache: boolean; savedAt: string | null }> => {
      if (!listingId) return { guide: null, fromCache: false, savedAt: null };
      const { data, error } = await supabase.rpc("get_sitter_guide", { p_listing_id: listingId });
      if (error) {
        // Network or server problem: use the offline copy if it's still valid.
        const cached = readGuideCache<SitterGuide>(listingId);
        if (cached) return { guide: cached.data, fromCache: true, savedAt: cached.savedAt };
        throw error;
      }
      const guide = (data as unknown as SitterGuide | null) ?? null;
      if (!guide) {
        clearGuideCache(listingId);
        return { guide: null, fromCache: false, savedAt: null };
      }
      writeGuideCache(listingId, guide, guide.ends_at);
      return { guide, fromCache: false, savedAt: null };
    },
    enabled: !!listingId && !!user && enabled,
    // Re-check around the unlock moment and when access ends.
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  // Lock the view the moment the window closes, even without a refetch.
  const endsAt = query.data?.guide?.ends_at;
  const { refetch } = query;
  useEffect(() => {
    if (!endsAt || !listingId) return;
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0 || ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => {
      clearGuideCache(listingId);
      refetch();
    }, ms + 1000);
    return () => clearTimeout(t);
  }, [endsAt, listingId, refetch]);

  return {
    ...query,
    guide: query.data?.guide ?? null,
    fromCache: query.data?.fromCache ?? false,
    savedAt: query.data?.savedAt ?? null,
  };
};

/** 5-minute signed URLs for the photos this sitter may see right now. */
export const useSitterGuidePhotoUrls = (listingId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["sitter-guide-photo-urls", listingId],
    queryFn: async (): Promise<Record<string, string>> => {
      if (!listingId) return {};
      const { data, error } = await supabase.functions.invoke<{ urls?: Record<string, string> }>(
        "welcome-guide-photo-urls",
        { body: { listing_id: listingId } },
      );
      if (error) return {};
      return data?.urls ?? {};
    },
    enabled: !!listingId && enabled,
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
  });

export interface GuideWindow {
  sit_id: string;
  listing_id: string;
  unlock_at: string;
  ends_at: string;
  timezone: string;
  access_open: boolean;
}

/** Access windows for the signed-in sitter's current and upcoming sits. */
export const useMyGuideWindows = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-guide-windows", user?.id],
    queryFn: async (): Promise<GuideWindow[]> => {
      const { data, error } = await supabase.rpc("get_my_guide_windows");
      if (error) throw error;
      return (data ?? []) as GuideWindow[];
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });
};

/** "Friday 3 October, 00:00" in the listing's time zone, plus the zone. */
export const formatUnlock = (iso: string, timezone: string) => {
  const d = new Date(iso);
  const opts = { timeZone: timezone } as const;
  try {
    const day = d.toLocaleDateString("en-GB", { ...opts, weekday: "long", day: "numeric", month: "long" });
    const time = d.toLocaleTimeString("en-GB", { ...opts, hour: "2-digit", minute: "2-digit" });
    const zone = timezone === "UTC" ? "UTC" : `${timezone.split("/").pop()?.replace(/_/g, " ")} time`;
    return `${day}, ${time} (${zone})`;
  } catch {
    return d.toUTCString();
  }
};

/** Whole days until the unlock (at least 1 while it's still in the future). */
export const daysUntil = (iso: string) =>
  Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
