/**
 * Profile completeness for the dashboard ring, the "Finish your profile" card
 * and the profile preview tips: a percent and what's missing, in words.
 */
export interface CompletionProfile {
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface CompletionSitter {
  headline?: string | null;
  bio?: string | null;
  pet_types?: string[] | null;
  gallery?: string[] | null;
}

export interface CompletionOwner {
  bio?: string | null;
}

export interface Completion {
  percent: number;
  missing: string[];
  /** One friendly line naming what's missing, e.g. "Add a bio and 2 photos". */
  line: string;
}

const join = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const summarise = (checks: [boolean, string][]): Completion => {
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  const percent = Math.round(((checks.length - missing.length) / checks.length) * 100);
  const line = missing.length === 0 ? "" : `Add ${join(missing.slice(0, 2))}${missing.length > 2 ? " and more" : ""}`;
  return { percent, missing, line };
};

export const sitterCompletion = (p: CompletionProfile | null, s: CompletionSitter | null): Completion => {
  const photos = (s?.gallery ?? []).filter(Boolean).length;
  return summarise([
    [!!p?.first_name, "your name"],
    [!!p?.avatar_url, "a profile photo"],
    [!!(p?.city && p?.country), "your city"],
    [!!s?.headline, "a headline"],
    [!!s?.bio, "a bio"],
    [(s?.pet_types ?? []).length > 0, "the pets you care for"],
    [photos >= 2, photos === 1 ? "1 more photo" : "2 photos"],
  ]);
};

export const ownerCompletion = (p: CompletionProfile | null, o: CompletionOwner | null): Completion =>
  summarise([
    [!!p?.first_name, "your name"],
    [!!p?.avatar_url, "a profile photo"],
    [!!(p?.city && p?.country), "your city"],
    [!!o?.bio, "a bio"],
  ]);
