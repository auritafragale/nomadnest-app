/**
 * Welcome Guide structure and copy, shared by the owner editor, the dashboard
 * and listing cards, and the read-only view.
 *
 * Completion is NOT computed here: get_guide_completion (database) is the
 * single source for the % and the nudge, so the app and accept_application
 * always agree.
 */

export type GuideSection = "pets" | "emergency" | "house" | "access";

export const GUIDE_SECTIONS: { key: GuideSection; title: string; short: string }[] = [
  { key: "pets", title: "Pets", short: "Feeding, walks, routine and quirks" },
  { key: "emergency", title: "Vet and emergency", short: "Vet details and who to call" },
  { key: "house", title: "House rules and everyday living", short: "Bins, plants, heating and more" },
  { key: "access", title: "Arrival and access", short: "Keys, codes, alarm and Wi-Fi" },
];

export interface GuideTextField<K extends string = string> {
  key: K;
  label: string;
  placeholder: string;
  /** Label shown when the owner marks it "Not applicable" (e.g. "No alarm"). */
  naLabel?: string;
}

export const HOUSE_FIELDS: GuideTextField<
  "house_notes" | "bins_recycling" | "plants" | "appliances" | "heating_cooling" | "parking" | "neighbours"
>[] = [
  { key: "house_notes", label: "House notes", placeholder: "Anything quirky about the home, and how you like it kept" },
  { key: "bins_recycling", label: "Bins and recycling", placeholder: "Which bins go out, and on which day", naLabel: "No bin duties" },
  { key: "plants", label: "Plants", placeholder: "Which plants need water, and how often", naLabel: "No plants to look after" },
  { key: "appliances", label: "Appliances", placeholder: "Washing machine, dishwasher, oven quirks", naLabel: "Nothing special about the appliances" },
  { key: "heating_cooling", label: "Heating and cooling", placeholder: "Thermostat, air con, fireplace", naLabel: "Nothing to adjust" },
  { key: "parking", label: "Parking", placeholder: "Where to park, permits, visitor spaces", naLabel: "No parking" },
  { key: "neighbours", label: "Neighbours", placeholder: "Who's friendly, who has a spare key, anything to know", naLabel: "Nothing to know about the neighbours" },
];

export const EMERGENCY_FIELDS: GuideTextField<"emergency_contacts" | "out_of_hours_vet">[] = [
  { key: "emergency_contacts", label: "Emergency contacts", placeholder: "Who to call, their number, and when" },
  { key: "out_of_hours_vet", label: "Nearest out-of-hours vet", placeholder: "Name, address and phone, if you know one" },
];

export const ACCESS_FIELDS: GuideTextField<"key_handover" | "door_codes" | "alarm_instructions" | "wifi_details">[] = [
  { key: "key_handover", label: "Keys and handover", placeholder: "Where the key is, or how you'll hand it over" },
  { key: "door_codes", label: "Door and gate codes", placeholder: "Front door, gate, garage", naLabel: "No door codes" },
  { key: "alarm_instructions", label: "Alarm", placeholder: "How to set and unset it", naLabel: "No alarm" },
  { key: "wifi_details", label: "Wi-Fi", placeholder: "Network name and password", naLabel: "No Wi-Fi" },
];

export const PET_FIELDS: GuideTextField<
  "feeding_details" | "walks_exercise" | "daily_routine" | "medication_instructions" | "behaviour_notes"
>[] = [
  { key: "feeding_details", label: "Feeding", placeholder: "What, how much and when" },
  { key: "walks_exercise", label: "Walks and exercise", placeholder: "How often, how long, favourite routes" },
  { key: "daily_routine", label: "Daily routine", placeholder: "A typical day, from morning to bedtime" },
  { key: "medication_instructions", label: "Medication", placeholder: "What, how much, when, and how to give it" },
  { key: "behaviour_notes", label: "Behaviour and quirks", placeholder: "Habits, fears, what calms them, anything to watch for" },
];

// ─── Copy (exact) ────────────────────────────────────────────────────────────

export const GUIDE_COPY = {
  header: "Your Welcome Guide",
  subtext:
    "Everything your sitter needs, in one place. Complete guides mean fewer questions while you're away, a smoother handover, and pets who stick to their routine.",
  progress: (percent: number) => `Your guide is ${percent}% complete`,
  complete: "Your guide is complete. Your sitter will have everything they need.",
};

export interface GuideCompletion {
  percent: number;
  nudge: GuideSection | null;
  nudge_pet_name: string | null;
  sections: Record<GuideSection, { complete: boolean; fraction: number }>;
}

/** The nudge for the most important missing section. */
export const guideNudge = (c: GuideCompletion | null | undefined): string | null => {
  if (!c) return null;
  if (c.percent >= 100 || !c.nudge) return GUIDE_COPY.complete;
  switch (c.nudge) {
    case "pets":
      return `Add ${c.nudge_pet_name || "your pet"}'s routine so your sitter gets it right from day one.`;
    case "emergency":
      return "Add your vet and an emergency contact. It's the first thing a sitter needs if something goes wrong.";
    case "access":
      return "Add your arrival details so your sitter can let themselves in stress-free.";
    case "house":
      return "Add a few house notes, like bin day and anything quirky about the home.";
  }
};

export const GUIDE_PHOTO_BUCKET = "welcome-guide-photos";
