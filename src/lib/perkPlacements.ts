/**
 * Member perks placements (Batch P2): pure helpers, testable without a screen.
 */

export const PERK_PLACEMENTS = ["perks_page", "sit_confirmed", "sit_upcoming", "sit_now", "dashboard", "menu"] as const;
export type PerkPlacement = (typeof PERK_PLACEMENTS)[number];

export const PERK_LOGO_BUCKET = "perk-logos";

/** Logo files the admin uploader accepts (checked again by the storage rules). */
export const PERK_LOGO_EXTENSIONS = ["png", "webp", "svg", "jpg", "jpeg"] as const;
export const PERK_LOGO_MAX_BYTES = 512 * 1024;

export const PERK_LOGO_TYPES: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** Plain messages for a file the uploader won't take, or null when it's fine. */
export const checkLogoFile = (file: { name: string; type: string; size: number }) => {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const okExt = (PERK_LOGO_EXTENSIONS as readonly string[]).includes(ext);
  if (!okExt || (file.type && file.type !== PERK_LOGO_TYPES[ext])) return "Please choose a PNG, WebP, SVG or JPG file.";
  if (file.size > PERK_LOGO_MAX_BYTES) return "That file is larger than 512 KB. Please choose a smaller one.";
  return null;
};

/**
 * perks.logo_url holds a file name in our private perk-logos bucket, for
 * example "safetywing-1760000000000.png". The app shows it through a signed
 * link; anything else (a partner website, a data: URL, another bucket) gets
 * the letter tile.
 */
export const perkLogoPath = (value: string | null | undefined): string | null => {
  const v = (value ?? "").trim();
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(png|webp|svg|jpe?g)$/i.test(v) ? v : null;
};

/**
 * Files to delete when the perk editor closes: every logo uploaded or saved
 * before that the perk no longer uses. Not saved: only this session's uploads.
 */
export const logoFilesToDelete = ({ saved, uploaded, final }: { saved: string | null; uploaded: string[]; final: string | null }) => {
  const keep = perkLogoPath(final);
  return [...new Set([...uploaded, saved])].map(perkLogoPath).filter((p): p is string => !!p && p !== keep);
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
