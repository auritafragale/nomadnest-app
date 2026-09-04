import {
  Dog,
  Cat,
  Bird,
  Fish,
  Rabbit,
  Turtle,
  Squirrel,
  PawPrint,
  type LucideIcon,
} from "lucide-react";
import { Horse, Snake } from "@/components/icons/AnimalIcons";

/**
 * Pet type values have been stored in several shapes over time
 * ("dog", "dogs", "Small_pets"...). Everything is normalised to one
 * canonical key before it is labelled or given an icon.
 */
const CANONICAL: Record<string, string> = {
  dog: "dogs",
  dogs: "dogs",
  cat: "cats",
  cats: "cats",
  bird: "birds",
  birds: "birds",
  fish: "fish",
  rabbit: "rabbits",
  rabbits: "rabbits",
  reptile: "reptiles",
  reptiles: "reptiles",
  exotic: "exotics",
  exotics: "exotics",
  farm: "farm",
  farm_animals: "farm",
  // Legacy bucket values are folded into rabbits (small mammals).
  small_pets: "rabbits",
  small_mammals: "rabbits",
};

const PET_TYPE_LABELS: Record<string, string> = {
  dogs: "Dogs",
  cats: "Cats",
  birds: "Birds",
  fish: "Fish",
  rabbits: "Rabbits",
  reptiles: "Reptiles",
  exotics: "Exotics",
  farm: "Farm animals",
};

const PET_TYPE_ICONS: Record<string, LucideIcon> = {
  dogs: Dog,
  cats: Cat,
  birds: Bird,
  fish: Fish,
  rabbits: Rabbit,
  reptiles: Snake as unknown as LucideIcon,
  exotics: Turtle,
  farm: Horse as unknown as LucideIcon,
};

/** The canonical option list used by pickers. */
export const PET_TYPE_OPTIONS = [
  "dogs",
  "cats",
  "birds",
  "fish",
  "rabbits",
  "reptiles",
  "exotics",
  "farm",
];

export const canonicalPetType = (value: string) => {
  const key = (value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return CANONICAL[key] ?? key;
};

export const formatPetType = (value: string) => {
  const key = canonicalPetType(value);
  return (
    PET_TYPE_LABELS[key] ??
    key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
};

export const petTypeIcon = (value: string): LucideIcon =>
  PET_TYPE_ICONS[canonicalPetType(value)] ?? PawPrint;

/** Removes duplicates that come from mixed legacy values, preserving order. */
export const dedupePetTypes = (values: string[] | null | undefined) => {
  const seen = new Set<string>();
  const out: string[] = [];
  (values || []).forEach((v) => {
    const key = canonicalPetType(v);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
};

/** Formats a pet age value as "3 years old" / "0 years old". */
export const formatPetAge = (age: string | number | null | undefined) => {
  if (age === null || age === undefined) return null;
  const raw = String(age).trim();
  if (!raw) return null;
  // Already descriptive (e.g. "8 months", "3 years old") — leave as-is.
  if (/[a-z]/i.test(raw)) return raw;
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  const years = Math.max(0, Math.floor(num));
  return `${years} ${years === 1 ? "year" : "years"} old`;
};
