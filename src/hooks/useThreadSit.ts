import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyGuideWindows } from "@/hooks/useSitterGuide";
import type { Conversation } from "@/hooks/useConversations";

export interface ThreadSitInfo {
  photo: string | null;
  city: string | null;
  country: string | null;
  petNames: string[];
  /** When the Welcome Guide opens for the Nomad (Nomad side only). */
  guideUnlockAt: string | null;
  guideTimezone: string | null;
}

/**
 * Listing photo, place and pet names for the sit strip and the desktop sit
 * panel. Pet names and the city are already on the public listing.
 */
export const useThreadSit = (conversation: Conversation | null) => {
  const { user } = useAuth();
  const listingId = conversation?.listing_id ?? null;
  const sitId = conversation?.context.sit_id ?? null;
  const isNomad = !!conversation && !!user && conversation.sitter_user_id === user.id;
  const { data: windows = [] } = useMyGuideWindows();

  const info = useQuery({
    queryKey: ["thread-sit", listingId],
    queryFn: async () => {
      const [{ data: listing }, { data: pets }] = await Promise.all([
        supabase.from("listings").select("photos, city, country").eq("id", listingId!).maybeSingle(),
        supabase.from("pets").select("name").eq("listing_id", listingId!),
      ]);
      const photos = (listing?.photos ?? []) as string[];
      return {
        photo: photos[0] ?? null,
        city: listing?.city ?? null,
        country: listing?.country ?? null,
        petNames: (pets ?? []).map((p) => (p.name ?? "").trim()).filter(Boolean),
      };
    },
    enabled: !!listingId,
    staleTime: 5 * 60 * 1000,
  });

  const win = isNomad && sitId ? windows.find((w) => w.sit_id === sitId) : undefined;
  const data: ThreadSitInfo | null = info.data
    ? { ...info.data, guideUnlockAt: win?.unlock_at ?? null, guideTimezone: win?.timezone ?? null }
    : null;
  return data;
};

/** "Miso and Tofu", "Miso, Tofu and Pip". */
export const petList = (names: string[]) =>
  names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
