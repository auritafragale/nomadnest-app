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
  experience_level?: string | null;
  languages?: string[] | null;
  sit_style?: string | null;
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

/** Text that counts as filled in: a bio of only spaces is empty. */
const filled = (v: string | null | undefined) => !!v?.trim();

const join = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const summarise = (checks: [boolean, string][]): Completion => {
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  const percent = Math.round(((checks.length - missing.length) / checks.length) * 100);
  // "Add a bio", "Add a bio and your city", "Add a bio, your city and more".
  const line =
    missing.length === 0 ? "" : missing.length > 2 ? `Add ${missing.slice(0, 2).join(", ")} and more` : `Add ${join(missing)}`;
  return { percent, missing, line };
};

export const sitterCompletion = (p: CompletionProfile | null, s: CompletionSitter | null): Completion => {
  const photos = (s?.gallery ?? []).filter(Boolean).length;
  return summarise([
    [filled(p?.first_name), "your name"],
    [!!p?.avatar_url, "a profile photo"],
    [filled(p?.city) && filled(p?.country), "your city"],
    [filled(s?.headline), "a headline"],
    [filled(s?.bio), "a bio"],
    [(s?.pet_types ?? []).length > 0, "the pets you care for"],
    [photos >= 2, photos === 1 ? "1 more photo" : "2 photos"],
    // The same rules as the Nomad editor sections.
    [filled(s?.experience_level), "your experience"],
    [(s?.languages ?? []).filter(Boolean).length > 0, "the languages you speak"],
    [filled(s?.sit_style), "your sit style"],
  ]);
};

export const ownerCompletion = (p: CompletionProfile | null, o: CompletionOwner | null): Completion =>
  summarise([
    [filled(p?.first_name), "your name"],
    [!!p?.avatar_url, "a profile photo"],
    [filled(p?.city) && filled(p?.country), "your city"],
    [filled(o?.bio), "a bio"],
  ]);
