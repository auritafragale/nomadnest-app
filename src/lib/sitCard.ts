import type { ListingWithDetails } from "@/hooks/useListings";
import { canonicalPetType } from "@/lib/petTypes";

/** One count per pet type, in the order the Pet Parent listed them. */
export const petCounts = (pets: ListingWithDetails["pets"]) => {
  const counts = new Map<string, number>();
  for (const p of pets) {
    const t = canonicalPetType(p.type);
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count }));
};

/** City and country, as on every sit card. */
export const sitPlace = (l: Pick<ListingWithDetails, "city" | "country">) =>
  [l.city, l.country].filter(Boolean).join(", ") || "Location to be confirmed";

/** The first open dates from today, and how many more open ranges follow. */
export const openDates = (l: Pick<ListingWithDetails, "sit_dates">) => {
  const today = new Date().toISOString().slice(0, 10);
  const open = [...l.sit_dates].filter((d) => d.status === "open" && d.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  return { first: open[0] ?? null, more: Math.max(0, open.length - 1) };
};
