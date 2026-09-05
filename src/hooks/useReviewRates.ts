import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReviewRate {
  user_id: string;
  reviews_written: number;
  sits_attended: number;
  review_rate: number | null;
}

/**
 * Review Response Rate = reviews written / sits completed.
 * Rewards members who keep the community's feedback loop alive.
 */
export const useReviewRates = (userIds: string[] | undefined) => {
  const ids = [...new Set(userIds || [])].filter(Boolean);

  return useQuery({
    queryKey: ["review-rates", ids.join(",")],
    queryFn: async () => {
      if (ids.length === 0) return new Map<string, ReviewRate>();
      const { data, error } = await supabase.rpc("member_review_rates" as never, {
        p_user_ids: ids,
      } as never);
      if (error) throw error;
      return new Map(
        ((data || []) as ReviewRate[]).map((row) => [row.user_id, row]),
      );
    },
    enabled: ids.length > 0,
  });
};

export const useReviewRate = (userId: string | undefined) => {
  const { data, isLoading } = useReviewRates(userId ? [userId] : []);
  return { rate: (userId && data?.get(userId)) || null, isLoading };
};

/** Members above this rate get a small nudge up the search results. */
export const REVIEW_RATE_BOOST_THRESHOLD = 80;
