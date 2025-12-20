import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface OwnerReview {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  reviewer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
  sit: {
    id: string;
    listing: {
      title: string;
      city: string | null;
      country: string | null;
    } | null;
  } | null;
}

export const useOwnerReviews = (ownerUserId: string | undefined) => {
  return useQuery({
    queryKey: ["owner-reviews", ownerUserId],
    queryFn: async () => {
      if (!ownerUserId) return [];

      const { data, error } = await supabase
        .from("reviews")
        .select(`
          id,
          rating,
          text,
          created_at,
          sit_id
        `)
        .eq("reviewee_user_id", ownerUserId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch related data for each review
      const reviewsWithDetails: OwnerReview[] = await Promise.all(
        (data || []).map(async (review) => {
          // Get reviewer profile
          const { data: sitData } = await supabase
            .from("sits")
            .select("id, sitter_user_id, listing_id")
            .eq("id", review.sit_id)
            .maybeSingle();

          let reviewer = null;
          let sit = null;

          if (sitData) {
            const { data: reviewerData } = await supabase
              .from("profiles")
              .select("id, first_name, last_name, avatar_url")
              .eq("id", sitData.sitter_user_id)
              .maybeSingle();

            reviewer = reviewerData;

            const { data: listingData } = await supabase
              .from("listings")
              .select("title, city, country")
              .eq("id", sitData.listing_id)
              .maybeSingle();

            sit = {
              id: sitData.id,
              listing: listingData,
            };
          }

          return {
            ...review,
            reviewer,
            sit,
          };
        })
      );

      return reviewsWithDetails;
    },
    enabled: !!ownerUserId,
  });
};

export const useOwnerAverageRating = (ownerUserId: string | undefined) => {
  const { data: reviews = [] } = useOwnerReviews(ownerUserId);

  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return {
    averageRating: Math.round(averageRating * 10) / 10,
    reviewCount: reviews.length,
  };
};
