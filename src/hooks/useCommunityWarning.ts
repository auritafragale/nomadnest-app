import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { flagLabel } from "@/lib/trustFlags";
import { useAuth } from "@/contexts/AuthContext";
import { isQuietAuthError } from "@/lib/signInCheck";

/**
 * Active strike-three warnings for a listing (shown to Nomads before they
 * apply) or for a nomad (shown to Pet Parents before they accept).
 * Anything below strike three stays completely invisible.
 */
export const useCommunityWarning = (
  subjectType: "listing" | "user",
  subjectId: string | undefined,
) => {
  // Members only: signed out (listing pages are public) nothing is asked.
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["community-warning", subjectType, subjectId, !!session],
    queryFn: async () => {
      if (!subjectId) return [] as string[];
      // Only the warning categories for this one subject, never the strike rows.
      const { data, error } = await supabase.rpc("get_community_warnings", {
        p_subject_type: subjectType,
        p_subject_id: subjectId,
      });

      if (error) {
        if (isQuietAuthError(error)) return [] as string[];
        throw error;
      }
      return (data ?? []) as string[];
    },
    enabled: !!session && !!subjectId,
  });

  const categories = query.data || [];

  return {
    ...query,
    categories,
    labels: categories.map(flagLabel),
    hasWarning: categories.length > 0,
  };
};
