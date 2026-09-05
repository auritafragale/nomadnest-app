// Recency weighting for reviews: fresh feedback describes the home or nomad as
// they are today, so it counts for more than very old feedback.

export type ReviewSort = "recent" | "relevant";

export const reviewWeight = (createdAt: string): number => {
  const months =
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months <= 6) return 1.5;
  if (months <= 12) return 1.2;
  return 1;
};

/** Recency-weighted average rating. */
export const weightedAverage = (
  reviews: { rating: number; created_at: string }[],
): { average: number; count: number } => {
  if (reviews.length === 0) return { average: 0, count: 0 };
  let weightSum = 0;
  let ratingSum = 0;
  for (const r of reviews) {
    const w = reviewWeight(r.created_at);
    weightSum += w;
    ratingSum += r.rating * w;
  }
  return { average: ratingSum / weightSum, count: reviews.length };
};

/**
 * "Most relevant" = weight first (recent + more detailed reviews rise),
 * "Most recent" = plain date order.
 */
export const sortReviews = <T extends { created_at: string; text?: string | null }>(
  reviews: T[],
  sort: ReviewSort,
): T[] => {
  const list = [...reviews];
  if (sort === "recent") {
    return list.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }
  return list.sort((a, b) => {
    const score = (r: T) =>
      reviewWeight(r.created_at) + (r.text && r.text.trim().length > 60 ? 0.3 : 0);
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};
