import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Founding Member spots: the cap (sum of active codes' max_uses) and how many
 * are left (never below 0), from public_founding_spots(). Works signed out.
 * null while loading or if the function isn't there yet.
 */
export const useFoundingSpots = () =>
  useQuery({
    queryKey: ["founding-spots"],
    queryFn: async (): Promise<{ spotsLeft: number; cap: number } | null> => {
      const { data, error } = await supabase.rpc("public_founding_spots");
      if (error) return null;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row.cap !== "number" || typeof row.spots_left !== "number") return null;
      return { spotsLeft: row.spots_left, cap: row.cap };
    },
    staleTime: 5 * 60 * 1000,
  });

export const formatCount = (n: number) => n.toLocaleString("en-GB");
