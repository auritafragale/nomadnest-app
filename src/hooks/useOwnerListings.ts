import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface OwnerListing {
  id: string;
  title: string;
  status: "draft" | "published" | "paused";
  city: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
  photos: string[] | null;
  pets: {
    id: string;
    name: string | null;
    type: string;
  }[];
  sit_dates: {
    id: string;
    start_date: string;
    end_date: string;
    status: string;
  }[];
  _count: {
    applications: number;
  };
}

export const useOwnerListings = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["owner-listings", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");

      const { data: listings, error: listingsError } = await supabase
        .from("listings")
        .select("id, title, status, city, country, created_at, updated_at, photos")
        .eq("owner_user_id", user.id)
        .order("updated_at", { ascending: false });

      if (listingsError) throw listingsError;

      // Fetch pets and sit dates for each listing
      const listingsWithDetails = await Promise.all(
        listings.map(async (listing) => {
          const [petsResult, datesResult, applicationsResult] = await Promise.all([
            supabase
              .from("pets")
              .select("id, name, type")
              .eq("listing_id", listing.id),
            supabase
              .from("sit_dates")
              .select("id, start_date, end_date, status")
              .eq("listing_id", listing.id)
              .order("start_date", { ascending: true }),
            supabase
              .from("applications")
              // Only live applications count — declined/withdrawn rounds reset to 0.
              .select("id", { count: "exact" })
              .eq("listing_id", listing.id)
              .in("status", ["applied", "shortlisted", "accepted"]),
          ]);

          return {
            ...listing,
            status: listing.status as "draft" | "published" | "paused",
            pets: petsResult.data || [],
            sit_dates: datesResult.data || [],
            _count: {
              applications: applicationsResult.count || 0,
            },
          };
        })
      );

      return listingsWithDetails as OwnerListing[];
    },
    enabled: !!user,
  });
};
