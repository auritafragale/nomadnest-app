import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useNewApplicationsCount = () => {
  const { user, role } = useAuth();

  const { data: count = 0 } = useQuery({
    queryKey: ["new-applications-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      // Get all listings owned by the user
      const { data: listings } = await supabase
        .from("listings")
        .select("id")
        .eq("owner_user_id", user.id);

      if (!listings || listings.length === 0) return 0;

      const listingIds = listings.map((l) => l.id);

      // Count applications with status "applied" (new applications)
      const { count, error } = await supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .in("listing_id", listingIds)
        .eq("status", "applied");

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user && (role === "owner" || role === "both"),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return { newApplicationsCount: count };
};
