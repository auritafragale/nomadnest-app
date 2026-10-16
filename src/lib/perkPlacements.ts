/**
 * Member perks placements (Batch P2): pure helpers, testable without a screen.
 */

export const PERK_PLACEMENTS = ["perks_page", "sit_confirmed", "sit_upcoming", "sit_now", "dashboard", "menu"] as const;
export type PerkPlacement = (typeof PERK_PLACEMENTS)[number];

export const PERK_LOGO_BUCKET = "perk-logos";

/**
 * A logo URL the app may show: only files in our own public perk-logos
 * bucket. Partner websites (hotlinking) and data: URLs are never shown; the
 * letter tile is used instead.
 */
export const isOurPerkLogo = (url: string | null | undefined, supabaseUrl: string | undefined) => {
  if (!url || !supabaseUrl) return false;
  const base = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${PERK_LOGO_BUCKET}/`;
  if (!url.startsWith(base)) return false;
  const rest = url.slice(base.length);
  // A plain file name in the bucket, nothing that could leave it.
  return /^[A-Za-z0-9._/-]+$/.test(rest) && !rest.includes("..");
};

/** "{country} data plan" → "India data plan" from the member's own sit. With
 *  no sit the placeholder is dropped and the first letter capitalised. Empty
 *  short title: the perk name. */
export const shortTitleFor = (
  perk: { short_title?: string | null; name: string },
  place: { city?: string | null; country?: string | null } = {},
) => {
  const template = (perk.short_title ?? "").trim();
  if (!template) return perk.name;
  const filled = template
    .replace(/\{country\}/gi, (place.country ?? "").trim())
    .replace(/\{city\}/gi, (place.city ?? "").trim())
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!filled) return perk.name;
  return filled.charAt(0).toUpperCase() + filled.slice(1);
};

/** Days from `today` to `start` (YYYY-MM-DD, both in the home's time zone). */
export const daysUntil = (today: string, start: string) =>
  Math.round((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

/** The white pill on the Trip pass. */
export const countdownLabel = (days: number) => (days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days to go`);

/** "Peter", "Peter and Peter junior", "Miso, Tofu and Bean". First names only. */
export const petNamesSentence = (names: (string | null | undefined)[]) => {
  const n = names.map((x) => (x ?? "").trim()).filter(Boolean);
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};

/** "2026-10" for the "New this month" badge. */
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// ── On the device only (never sent to the server) ────────────────────────
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the pass simply shows again */
  }
};

export const tripPassStore = {
  isHidden: (sitId: string) => read(`nn_trip_pass_hidden:${sitId}`) === "1",
  hide: (sitId: string) => write(`nn_trip_pass_hidden:${sitId}`, "1"),
  done: (sitId: string): string[] => {
    try {
      const v = JSON.parse(read(`nn_trip_pass_done:${sitId}`) ?? "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  },
  markDone: (sitId: string, perkId: string) => {
    const now = tripPassStore.done(sitId);
    if (!now.includes(perkId)) write(`nn_trip_pass_done:${sitId}`, JSON.stringify([...now, perkId]));
  },
};

export const sitConfirmedStore = {
  seen: (sitId: string) => read(`nn_sit_confirmed_seen:${sitId}`) === "1",
  markSeen: (sitId: string) => write(`nn_sit_confirmed_seen:${sitId}`, "1"),
};

export const perksMonthStore = {
  seenThisMonth: () => read("nn_perks_seen_month") === monthKey(),
  markSeen: () => write("nn_perks_seen_month", monthKey()),
};
