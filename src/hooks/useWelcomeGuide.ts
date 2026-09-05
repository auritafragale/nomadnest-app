import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WelcomeGuide {
  owner_user_id: string | null;
  wifi_info: string | null;
  vet_info: string | null;
  feeding_schedule: string | null;
  emergency_contacts: string | null;
  house_notes: string | null;
  updated_at?: string | null;
}

const cacheKey = (ownerId: string) => `nn_welcome_guide_${ownerId}`;

/**
 * One reusable Welcome Guide per Pet Parent. Reads by owner_user_id, keeping a
 * copy on the device so it still opens with no signal.
 */
export const useWelcomeGuide = (ownerUserId: string | undefined) => {
  const [cached, setCached] = useState<WelcomeGuide | null>(null);

  useEffect(() => {
    if (!ownerUserId) return;
    try {
      const raw = localStorage.getItem(cacheKey(ownerUserId));
      if (raw) setCached(JSON.parse(raw) as WelcomeGuide);
    } catch {
      /* ignore unreadable cache */
    }
  }, [ownerUserId]);

  const query = useQuery({
    queryKey: ["welcome-guide", ownerUserId],
    queryFn: async (): Promise<WelcomeGuide | null> => {
      if (!ownerUserId) return null;
      const { data, error } = await supabase
        .from("welcome_guides")
        .select("owner_user_id, wifi_info, vet_info, feeding_schedule, emergency_contacts, house_notes, updated_at")
        .eq("owner_user_id", ownerUserId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        try {
          localStorage.setItem(cacheKey(ownerUserId), JSON.stringify(data));
        } catch {
          /* storage full or blocked — online view still works */
        }
      }
      return (data as WelcomeGuide) || null;
    },
    enabled: !!ownerUserId,
  });

  return {
    ...query,
    guide: query.data ?? cached,
    isOffline: !query.data && !!cached,
    cachedAt: cached?.updated_at ?? null,
  };
};

export const useSaveWelcomeGuide = (ownerUserId: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: Omit<WelcomeGuide, "owner_user_id" | "updated_at">) => {
      if (!ownerUserId) throw new Error("Missing Pet Parent");
      const { error } = await supabase
        .from("welcome_guides")
        .upsert(
          { owner_user_id: ownerUserId, ...values, updated_at: new Date().toISOString() },
          { onConflict: "owner_user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["welcome-guide", ownerUserId] });
      toast.success("Welcome Guide saved");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not save the Welcome Guide");
    },
  });
};
