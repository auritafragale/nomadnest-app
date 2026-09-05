import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WelcomeGuide {
  listing_id: string;
  wifi_info: string | null;
  vet_info: string | null;
  feeding_schedule: string | null;
  emergency_contacts: string | null;
  house_notes: string | null;
  updated_at?: string | null;
}

const cacheKey = (listingId: string) => `nn_welcome_guide_${listingId}`;

/** Reads the guide, keeping a copy on the device so it still opens with no signal. */
export const useWelcomeGuide = (listingId: string | undefined) => {
  const [cached, setCached] = useState<WelcomeGuide | null>(null);

  useEffect(() => {
    if (!listingId) return;
    try {
      const raw = localStorage.getItem(cacheKey(listingId));
      if (raw) setCached(JSON.parse(raw) as WelcomeGuide);
    } catch {
      /* ignore unreadable cache */
    }
  }, [listingId]);

  const query = useQuery({
    queryKey: ["welcome-guide", listingId],
    queryFn: async (): Promise<WelcomeGuide | null> => {
      if (!listingId) return null;
      const { data, error } = await supabase
        .from("welcome_guides")
        .select("listing_id, wifi_info, vet_info, feeding_schedule, emergency_contacts, house_notes, updated_at")
        .eq("listing_id", listingId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        try {
          localStorage.setItem(cacheKey(listingId), JSON.stringify(data));
        } catch {
          /* storage full or blocked — online view still works */
        }
      }
      return (data as WelcomeGuide) || null;
    },
    enabled: !!listingId,
  });

  return {
    ...query,
    guide: query.data ?? cached,
    isOffline: !query.data && !!cached,
    cachedAt: cached?.updated_at ?? null,
  };
};

export const useSaveWelcomeGuide = (listingId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: Omit<WelcomeGuide, "listing_id" | "updated_at">) => {
      if (!listingId) throw new Error("Missing listing");
      const { error } = await supabase
        .from("welcome_guides")
        .upsert(
          { listing_id: listingId, ...values, updated_at: new Date().toISOString() },
          { onConflict: "listing_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["welcome-guide", listingId] });
      toast.success("Welcome Guide saved");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not save the Welcome Guide");
    },
  });
};
