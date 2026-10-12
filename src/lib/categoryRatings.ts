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

/** member_ratings' category averages, as a list with labels. */
export const categoryAveragesFrom = (
  averages: Record<string, number> | null | undefined,
  categories: { key: string; label: string }[]
): CategoryAverage[] =>
  categories
    .filter(({ key }) => typeof averages?.[key] === "number")
    .map(({ key, label }) => ({ key, label, average: Number(averages![key]) }));

