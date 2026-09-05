import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { flagLabel } from "@/lib/trustFlags";

/**
 * Active strike-three warnings for a listing (shown to Nomads before they
 * apply) or for a nomad (shown to Pet Parents before they accept).
 * Anything below strike three stays completely invisible.
 */
export const useCommunityWarning = (
  subjectType: "listing" | "user",
  subjectId: string | undefined,
) => {
  const query = useQuery({
    queryKey: ["community-warning", subjectType, subjectId],
    queryFn: async () => {
      if (!subjectId) return [] as string[];
      const { data, error } = await supabase
        .from("community_strikes")
        .select("category")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .eq("show_strike_three_warning", true);

      if (error) throw error;
      return (data || []).map((row) => row.category as string);
    },
    enabled: !!subjectId,
  });

  const categories = query.data || [];

  return {
    ...query,
    categories,
    labels: categories.map(flagLabel),
    hasWarning: categories.length > 0,
  };
};
