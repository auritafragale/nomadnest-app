// Private community flag categories. These are never shown on a public
// profile — they only feed the internal 3-strike escalation and, at strike 3,
// the cautionary "Community Information Notice" shown just before someone
// commits to a sit.

export type HomeFlagCategory =
  | "home_cleanliness"
  | "undisclosed_cameras"
  | "pet_aggression";

export type NomadFlagCategory =
  | "sitter_cleanliness"
  | "pet_neglect"
  | "abandonment"
  | "unauthorized_guests";

/** Seen by admins only: never a member-facing notice or heads-up email. */
export type AdminFlagCategory = "not_homeowner";

export type FlagCategory = HomeFlagCategory | NomadFlagCategory | AdminFlagCategory;

export const FLAG_LABELS: Record<FlagCategory, string> = {
  home_cleanliness: "Home Cleanliness",
  undisclosed_cameras: "Unmapped Security Cameras",
  pet_aggression: "Pet Behavioural Quirks",
  sitter_cleanliness: "Home Cleanliness",
  pet_neglect: "Pet Care Protocol",
  abandonment: "Timeline Reliability",
  unauthorized_guests: "Unauthorized Guests",
  not_homeowner: "Not the homeowner",
};

/**
 * Asked of Nomads only. "No" raises an admin-only not_homeowner flag on the
 * listing; admins see a warning once it comes from 2 or more different sits.
 */
export const HOMEOWNER_QUESTION = {
  column: "flag_not_homeowner",
  category: "not_homeowner",
  question: "Was the person you dealt with the homeowner?",
  options: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
    { value: "not_sure", label: "Not sure" },
  ],
} as const;

export type HomeownerAnswer = (typeof HOMEOWNER_QUESTION.options)[number]["value"];

export const NOT_HOMEOWNER_ADMIN_WARNING_AT = 2;

/** True for an admin-only category that has reached its admin warning. */
export const isAdminFlagWarning = (category: string, flagCount: number) =>
  category === "not_homeowner" && flagCount >= NOT_HOMEOWNER_ADMIN_WARNING_AT;

/** Review columns that raise a private flag when answered "No". */
export const HOME_FLAG_QUESTIONS: {
  column: "flag_home_cleanliness" | "flag_undisclosed_cameras" | "flag_pet_aggression";
  category: HomeFlagCategory;
  question: string;
  /** true when a "Yes" answer is the healthy one. */
  yesIsGood: boolean;
}[] = [
  {
    column: "flag_home_cleanliness",
    category: "home_cleanliness",
    question: "Was the home clean and ready when you arrived?",
    yesIsGood: true,
  },
  {
    column: "flag_pet_aggression",
    category: "pet_aggression",
    question: "Were the pets as described in the listing?",
    yesIsGood: true,
  },
  {
    column: "flag_undisclosed_cameras",
    category: "undisclosed_cameras",
    question: "Did you find any indoor cameras that weren't disclosed?",
    yesIsGood: false,
  },
];

export const NOMAD_FLAG_QUESTIONS: {
  column: "flag_sitter_cleanliness" | "flag_pet_neglect" | "flag_abandonment" | "flag_unauthorized_guests";
  category: NomadFlagCategory;
  question: string;
  yesIsGood: boolean;
}[] = [
  {
    column: "flag_sitter_cleanliness",
    category: "sitter_cleanliness",
    question: "Was your home left clean and undamaged?",
    yesIsGood: true,
  },
  {
    column: "flag_pet_neglect",
    category: "pet_neglect",
    question: "Were your pets well cared for (clean, medicated, relaxed)?",
    yesIsGood: true,
  },
  {
    column: "flag_abandonment",
    category: "abandonment",
    question: "Did the nomad leave the sit early without agreeing it with you?",
    yesIsGood: false,
  },
  {
    column: "flag_unauthorized_guests",
    category: "unauthorized_guests",
    question: "Were there any other guests staying that were not previously agreed upon?",
    yesIsGood: false,
  },
];

export const flagLabel = (category: string) =>
  FLAG_LABELS[category as FlagCategory] || category.replace(/_/g, " ");
