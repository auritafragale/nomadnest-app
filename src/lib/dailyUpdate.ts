import { Bone, Flag, Footprints, Heart, Leaf, Pill, Sparkles, type LucideIcon } from "lucide-react";

/** The quick-tap chips on today's update (stored codes must match the DB guard). */
export type UpdateChip = "fed" | "walked" | "meds" | "play" | "litter_garden" | "all_good" | "flag";

export const UPDATE_CHIPS: { code: UpdateChip; label: string; Icon: LucideIcon }[] = [
  { code: "fed", label: "Fed", Icon: Bone },
  { code: "walked", label: "Walked", Icon: Footprints },
  { code: "meds", label: "Meds given", Icon: Pill },
  { code: "play", label: "Playtime", Icon: Sparkles },
  { code: "litter_garden", label: "Litter or garden", Icon: Leaf },
  { code: "all_good", label: "All good", Icon: Heart },
  { code: "flag", label: "Something to flag", Icon: Flag },
];

export const chipInfo = (code: string) => UPDATE_CHIPS.find((c) => c.code === code);

/** Old one-tap check-ins, shown as a single chip in the timeline. */
export const LEGACY_KIND_CHIP: Record<string, UpdateChip | undefined> = {
  pets_fed: "fed",
  walk_completed: "walked",
  meds_given: "meds",
};

export const MAX_UPDATE_PHOTOS = 4;
export const UPDATE_PHOTO_BUCKET = "sit-update-photos";

/** Languages an owner can read updates in (must match the DB check). */
export const UPDATE_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "sv", label: "Svenska" },
  { code: "da", label: "Dansk" },
  { code: "nb", label: "Norsk" },
  { code: "pl", label: "Polski" },
  { code: "el", label: "Ελληνικά" },
];

export const languageLabel = (code: string | null | undefined) =>
  UPDATE_LANGUAGES.find((l) => l.code === code)?.label ?? null;

/** The browser's language as one of ours, or null (Norwegian variants -> nb). */
export const browserLanguage = (): string | null => {
  const raw = (typeof navigator !== "undefined" && (navigator.languages?.[0] || navigator.language)) || "";
  const base = raw.toLowerCase().split("-")[0];
  const code = base === "no" || base === "nn" ? "nb" : base;
  return UPDATE_LANGUAGES.some((l) => l.code === code) ? code : null;
};

/** "Tue 14 Oct" for a YYYY-MM-DD day. */
export const formatDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Whole days between two YYYY-MM-DD dates. */
export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);
