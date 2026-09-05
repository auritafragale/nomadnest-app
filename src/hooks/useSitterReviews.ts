import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { weightedAverage } from "@/lib/ratingWeights";

export interface SitterReview {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  rating_pet_care: number | null;
  rating_communication: number | null;
  rating_cleanliness: number | null;
  rating_reliability: number | null;
  rating_respect_home: number | null;
  reviewer: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
  sit: {
    listing: {
      title: string;
      city: string | null;
      country: string | null;
    };
  };
}

export const useSitterReviews = (sitterUserId: string | undefined) => {
  return useQuery({
    queryKey: ["sitter-reviews", sitterUserId],
    queryFn: async () => {
      if (!sitterUserId) return [];

      // Get reviews where the sitter is the reviewee
      const { data: reviews, error } = await supabase
        .from("reviews")
        .select(`
          id,
          rating,
          text,
          created_at,
          reviewer_user_id,
          sit_id,
          rating_pet_care,
          rating_communication,
          rating_cleanliness,
          rating_reliability,
          rating_respect_home
        `)
        .eq("reviewee_user_id", sitterUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!reviews || reviews.length === 0) return [];

      // Fetch reviewer profiles and sit details
      const reviewerIds = [...new Set(reviews.map((r) => r.reviewer_user_id))];
      const sitIds = [...new Set(reviews.map((r) => r.sit_id))];

      const [profilesResult, sitsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url")
          .in("id", reviewerIds),
        supabase
          .from("sits")
          .select("id, listing_id")
          .in("id", sitIds),
      ]);

      const profiles = profilesResult.data || [];
      const sits = sitsResult.data || [];

      // Get listing details
      const listingIds = [...new Set(sits.map((s) => s.listing_id))];
      const { data: listings } = await supabase
        .from("listings")
        .select("id, title, city, country")
        .in("id", listingIds);

      const listingsMap = new Map((listings || []).map((l) => [l.id, l]));
      const sitsMap = new Map(sits.map((s) => [s.id, s]));
      const profilesMap = new Map(profiles.map((p) => [p.id, p]));

      return reviews.map((review) => {
        const reviewer = profilesMap.get(review.reviewer_user_id);
        const sit = sitsMap.get(review.sit_id);
        const listing = sit ? listingsMap.get(sit.listing_id) : null;

        return {
          id: review.id,
          rating: review.rating,
          text: review.text,
          created_at: review.created_at,
          rating_pet_care: review.rating_pet_care,
          rating_communication: review.rating_communication,
          rating_cleanliness: review.rating_cleanliness,
          rating_reliability: review.rating_reliability,
          rating_respect_home: review.rating_respect_home,
          reviewer: {
            first_name: reviewer?.first_name || null,
            last_name: reviewer?.last_name || null,
            avatar_url: reviewer?.avatar_url || null,
          },
          sit: {
            listing: {
              title: listing?.title || "Unknown listing",
              city: listing?.city || null,
              country: listing?.country || null,
            },
          },
        } as SitterReview;
      });
    },
    enabled: !!sitterUserId,
  });
};

export const useSitterAverageRating = (sitterUserId: string | undefined) => {
  return useQuery({
    queryKey: ["sitter-average-rating", sitterUserId],
    queryFn: async () => {
      if (!sitterUserId) return { average: 0, count: 0 };

      const { data, error } = await supabase
        .from("reviews")
        .select("rating, created_at")
        .eq("reviewee_user_id", sitterUserId);

      if (error) throw error;
      if (!data || data.length === 0) return { average: 0, count: 0 };

      // Recency-weighted: reviews under 6 months count 1.5x, 6-12 months 1.2x.
      return weightedAverage(data);
    },
    enabled: !!sitterUserId,
  });
};
