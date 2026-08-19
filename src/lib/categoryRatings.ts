export type CategoryAverage = { key: string; label: string; average: number };

export const SITTER_RATING_CATEGORIES: { key: string; label: string }[] = [
  { key: "rating_pet_care", label: "Pet care" },
  { key: "rating_communication", label: "Communication" },
  { key: "rating_cleanliness", label: "Cleanliness" },
  { key: "rating_reliability", label: "Reliability" },
  { key: "rating_respect_home", label: "Respect for home" },
];

export const OWNER_RATING_CATEGORIES: { key: string; label: string }[] = [
  { key: "rating_communication", label: "Communication" },
  { key: "rating_home_accuracy", label: "Home accuracy" },
  { key: "rating_pet_preparedness", label: "Pet prep" },
  { key: "rating_hospitality", label: "Hospitality" },
  { key: "rating_clear_expectations", label: "Clear expectations" },
];

export const REVIEW_CATEGORY_COLUMNS = [
  "rating_pet_care",
  "rating_communication",
  "rating_cleanliness",
  "rating_reliability",
  "rating_respect_home",
  "rating_home_accuracy",
  "rating_pet_preparedness",
  "rating_hospitality",
  "rating_clear_expectations",
] as const;

type ReviewRow = object;

/**
 * Averages each category sub-rating across a set of reviews.
 * Categories with no scores at all are omitted.
 */
export const aggregateCategoryRatings = (
  reviews: ReviewRow[],
  categories: { key: string; label: string }[]
): CategoryAverage[] => {
  return categories
    .map(({ key, label }) => {
      const values = reviews
        .map((r) => (r as Record<string, unknown>)[key])
        .filter((v): v is number => typeof v === "number" && v > 0);
      if (values.length === 0) return null;
      return {
        key,
        label,
        average: values.reduce((a, b) => a + b, 0) / values.length,
      };
    })
    .filter((c): c is CategoryAverage => c !== null);
};
