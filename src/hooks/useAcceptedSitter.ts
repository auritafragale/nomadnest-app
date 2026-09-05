import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * True when the current user has a confirmed/in-progress/completed sit on
 * the given listing — i.e. they're an accepted Nomad who can view the owner's
 * Welcome Guide.
 */
export const useAcceptedSitter = (listingId: string | undefined) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["accepted-sitter", listingId, user?.id],
    queryFn: async () => {
      if (!user || !listingId) return false;
      const { data, error } = await supabase
        .from("sits")
        .select("id")
        .eq("listing_id", listingId)
        .eq("sitter_user_id", user.id)
        .in("status", ["confirmed", "in_progress", "completed"])
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!user && !!listingId,
  });
};
