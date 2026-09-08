import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Tokenizes a search string into lowercase words on any non-alphanumeric
 * character, then checks that every word appears in at least one of the
 * provided fields. This makes "Dubai - United Arab Emirates" match
 * "dubai united arab emirates" regardless of punctuation.
 */
export function matchesAllTokens(search: string, fields: (string | null | undefined)[]): boolean {
  const words = search
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}
