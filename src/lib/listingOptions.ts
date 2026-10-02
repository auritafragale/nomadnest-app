// Listing form options (design: ListingFormPhone). The stored values never
// change, because existing listings use them; only the words shown do.

export type Option = { value: string; label: string; sub?: string };

export const BEST_FOR: Option[] = [
  { value: "🛋️ Remote Workers (Fast Wi-Fi & Dedicated Desk)", label: "Remote workers", sub: "Fast Wi-Fi and a proper desk" },
  { value: "🎒 Sightseers (Great location, plenty of free time)", label: "Sightseers", sub: "Great location and plenty of free time" },
  { value: "🌿 Nature Lovers (Quiet, scenic, or rural)", label: "Nature lovers", sub: "Quiet, scenic or rural" },
  { value: "🏠 Homebodies (Pets need lots of companionship)", label: "Homebodies", sub: "Pets need lots of company" },
];

export const FLEXIBILITY: Option[] = [
  { value: "fixed", label: "Fixed dates" },
  { value: "flexible_1_2_days", label: "1–2 days" },
  { value: "flexible_week", label: "Up to a week" },
  { value: "very_flexible", label: "Very flexible" },
];

export const HANDOVER: Option[] = [
  { value: "flexible", label: "Flexible" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "overlap", label: "Overlap with the Nomad" },
];

export const PET_KINDS: Option[] = [
  { value: "dog", label: "Dog" },
  { value: "cat", label: "Cat" },
  { value: "bird", label: "Bird" },
  { value: "fish", label: "Fish" },
  { value: "rabbit", label: "Rabbit" },
  { value: "reptile", label: "Reptile" },
  { value: "farm_animal", label: "Farm" },
  { value: "other", label: "Other" },
];

export const LEFT_ALONE: Option[] = [
  { value: "never", label: "Never left alone" },
  { value: "1-4", label: "1–4 hours" },
  { value: "4-8", label: "4–8 hours" },
];

export const MUST_HAVES: Option[] = [
  { value: "Experience with my pet type", label: "Experience with my pets" },
  { value: "References from previous sits", label: "References" },
  { value: "Verified ID", label: "Verified ID" },
  { value: "Non-smoker", label: "Non-smoker" },
  { value: "Solo traveller", label: "Solo traveller" },
  { value: "No other pets accompanying", label: "No pets of their own" },
  { value: "Valid driver's license", label: "Driving licence" },
  { value: "First aid knowledge", label: "First aid" },
];

export const HOUSE_RULES: Option[] = [
  { value: "No smoking indoors", label: "No smoking indoors" },
  { value: "No parties or events", label: "No parties" },
  { value: "Pet not allowed on furniture", label: "No pets on furniture" },
  { value: "Pet not allowed in bedroom", label: "No pets in bedroom" },
  { value: "Keep garden gate locked", label: "Keep the gate locked" },
  { value: "Specific feeding schedule", label: "Feeding schedule" },
  { value: "No guests overnight", label: "No overnight guests" },
];

export const HOME_TASKS: Option[] = [
  { value: "Water plants", label: "Water plants" },
  { value: "Collect mail", label: "Collect post" },
  { value: "Take out trash/recycling", label: "Take out bins" },
  { value: "Light housekeeping", label: "Light cleaning" },
  { value: "Pool maintenance", label: "Pool care" },
  { value: "Garden care", label: "Garden care" },
];

export const UPDATES: Option[] = [
  { value: "daily", label: "Every day" },
  { value: "every_few_days", label: "Every few days" },
  { value: "weekly", label: "Once a week" },
  { value: "as_needed", label: "Only when needed" },
];

export const HOME_TYPES: Option[] = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "condo", label: "Condo" },
  { value: "cottage", label: "Cottage" },
];

export const SETTINGS: Option[] = [
  { value: "beach", label: "Beach" },
  { value: "city", label: "City" },
  { value: "countryside", label: "Countryside" },
  { value: "mountains", label: "Mountains" },
];

export const WIFI: Option[] = [
  { value: "excellent", label: "Excellent (fibre)" },
  { value: "good", label: "Good (video calls)" },
  { value: "basic", label: "Basic (browsing)" },
  { value: "none", label: "No Wi-Fi" },
];

export const SLEEPING: Option[] = [
  { value: "private_room", label: "Private room" },
  { value: "private_bathroom", label: "Private room with bathroom" },
  { value: "shared_space", label: "Shared space" },
  { value: "entire_place", label: "The whole place" },
];

export const AMENITIES: Option[] = [
  { value: "Washer/Dryer", label: "Washing machine" },
  { value: "Dishwasher", label: "Dishwasher" },
  { value: "Air Conditioning", label: "Air conditioning" },
  { value: "Heating", label: "Heating" },
  { value: "TV/Streaming", label: "TV and streaming" },
  { value: "Garden/Yard", label: "Garden" },
  { value: "Balcony/Terrace", label: "Balcony" },
  { value: "Parking", label: "Parking" },
  { value: "Workspace/Desk", label: "Desk to work at" },
  { value: "Coffee Machine", label: "Coffee machine" },
  { value: "Oven", label: "Oven" },
  { value: "Microwave", label: "Microwave" },
  { value: "Elevator/Lift", label: "Lift" },
  { value: "Iron & Board", label: "Iron" },
  { value: "Hair Dryer", label: "Hair dryer" },
  { value: "Gym Access", label: "Gym" },
  { value: "Pool", label: "Pool" },
  { value: "BBQ/Grill", label: "BBQ" },
  { value: "Bike Available", label: "Bike" },
  { value: "Car Available", label: "Car available" },
  { value: "Keyless/Smart Entry", label: "Smart lock" },
];

export const PRACTICAL = [
  { key: "remote_location", label: "Remote location", sub: "Rural or far from a town centre" },
  { key: "car_needed", label: "Car needed", sub: "A car is needed day to day" },
  { key: "heavy_gardening", label: "Plant care", sub: "Plants or a garden need watering" },
  { key: "wheelchair_accessible", label: "Step-free access", sub: "No stairs to where the Nomad stays" },
] as const;

const ALL: Option[] = [
  ...BEST_FOR,
  ...FLEXIBILITY,
  ...HANDOVER,
  ...MUST_HAVES,
  ...HOUSE_RULES,
  ...HOME_TASKS,
  ...UPDATES,
  ...HOME_TYPES,
  ...SETTINGS,
  ...WIFI,
  ...SLEEPING,
  ...AMENITIES,
  ...LEFT_ALONE,
];
const LABELS = new Map(ALL.map((o) => [o.value, o.label]));

/** The words to show for a stored option value (falls back to the value). */
export const optionLabel = (value: string | null | undefined) => (value ? LABELS.get(value) ?? value : "");
