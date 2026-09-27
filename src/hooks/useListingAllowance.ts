import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const LISTING_LIMIT_NOTE = "Your membership includes one home. Contact us if you need to list another.";

/**
 * How many listings this member may have (profiles.max_listings, private,
 * read through get_my_settings) and how many they have now. The database
 * enforces the limit on insert; this only shapes the UI.
 */
export const useListingAllowance = () => {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["listing-allowance", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_settings");
      if (error) throw error;
      const settings = (data ?? {}) as { max_listings?: number | null; listing_count?: number | null };
      return {
        maxListings: settings.max_listings ?? 1,
        listingCount: settings.listing_count ?? 0,
      };
    },
    enabled: !!user,
  });
  const maxListings = query.data?.maxListings ?? 1;
  const listingCount = query.data?.listingCount ?? 0;
  return {
    ...query,
    maxListings,
    listingCount,
    /** Only true once loaded, so nothing is hidden while it loads or on error. */
    atLimit: !!query.data && listingCount >= maxListings,
  };
};
