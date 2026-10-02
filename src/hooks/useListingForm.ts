import { useCallback, useEffect, useState } from "react";

export interface Pet {
  id: string;
  name: string;
  type: string;
  age: string;
  personality: string;
  feeding_details: string;
  daily_routine: string;
  walks_exercise: string;
  has_medication: boolean;
  medication_instructions: string;
  vet_info: string;
  photos: string[];
  /** never | 1-4 | 4-8 */
  separation_anxiety_tolerance: string;
  reactive_to_animals: boolean;
}

export interface SitDate {
  id: string;
  start_date: string;
  end_date: string;
  flexibility: string;
  handover_preference: string;
  /** Booked by a confirmed, in-progress or completed sit: read-only here. */
  locked?: boolean;
}

export interface ListingFormData {
  // Basics
  title: string;
  /** The title came from Help me write it (shows the AI note; never saved). */
  titleAi?: boolean;
  ideal_nomad_types: string[];
  sit_dates: SitDate[];

  // Pets
  pets: Pet[];

  // Expectations
  requirements: string[];
  requirements_other: string;
  house_rules: string[];
  house_rules_other: string;
  home_care_tasks: string[];
  home_care_tasks_other: string;
  communication_style: string;

  // Home
  home_type: string;
  location_type: string;
  public_transport_accessible: boolean | null;
  city: string;
  country: string;
  locationQuery: string;
  area: string;
  address_private: string;
  latitude: number | null;
  longitude: number | null;
  wifi_quality: string;
  sleeping_arrangement: string;
  amenities: string[];
  photos: string[];
  remote_location: boolean;
  car_needed: boolean;
  heavy_gardening: boolean;
  wheelchair_accessible: boolean;
  description: string;
  /** The description came from Polish with AI (never saved). */
  descriptionAi?: boolean;
}

export const STEP_NAMES = ["Basics", "Pets", "Expectations", "Home"] as const;
export const TOTAL_STEPS = STEP_NAMES.length;

export const newPet = (): Pet => ({
  id: crypto.randomUUID(),
  name: "",
  type: "dog",
  age: "",
  personality: "",
  feeding_details: "",
  daily_routine: "",
  walks_exercise: "",
  has_medication: false,
  medication_instructions: "",
  vet_info: "",
  photos: [],
  separation_anxiety_tolerance: "",
  reactive_to_animals: false,
});

export const newSitDate = (): SitDate => ({
  id: crypto.randomUUID(),
  start_date: "",
  end_date: "",
  flexibility: "fixed",
  handover_preference: "flexible",
});

export const emptyListingForm = (): ListingFormData => ({
  title: "",
  ideal_nomad_types: [],
  pets: [newPet()],
  sit_dates: [newSitDate()],
  requirements: [],
  requirements_other: "",
  house_rules: [],
  house_rules_other: "",
  home_care_tasks: [],
  home_care_tasks_other: "",
  communication_style: "",
  home_type: "",
  location_type: "",
  public_transport_accessible: null,
  city: "",
  country: "",
  locationQuery: "",
  area: "",
  address_private: "",
  latitude: null,
  longitude: null,
  wifi_quality: "",
  sleeping_arrangement: "",
  amenities: [],
  photos: [],
  remote_location: false,
  car_needed: false,
  heavy_gardening: false,
  wheelchair_accessible: false,
  description: "",
});

export type FormErrors = Record<string, string>;

/**
 * Checks one step (or all, step = 0). Keys: title, dates, date-{id},
 * name-{petId}, vet-{petId}, meds-{petId}, home_type, location.
 */
export const validateListing = (f: ListingFormData, step = 0): FormErrors => {
  const e: FormErrors = {};
  if (step === 0 || step === 1) {
    if (!f.title.trim()) e.title = "Add a title for your listing.";
    if (f.sit_dates.length === 0) e.dates = "Add at least one date range.";
    for (const d of f.sit_dates) {
      if (!d.locked && (!d.start_date || !d.end_date)) e[`date-${d.id}`] = "Pick both a start and an end date.";
    }
  }
  if (step === 0 || step === 2) {
    for (const p of f.pets) {
      if (!p.name.trim()) e[`name-${p.id}`] = "Add your pet's name.";
      if (!p.vet_info.trim()) e[`vet-${p.id}`] = "Add vet details. No regular vet yet? Add the nearest clinic.";
      if (p.has_medication && !p.medication_instructions.trim()) {
        e[`meds-${p.id}`] = "Add the medication instructions, or turn off Needs medication.";
      }
    }
  }
  if (step === 0 || step === 4) {
    if (!f.home_type) e.home_type = "Choose the type of home.";
    if (!f.city.trim() && !f.country.trim()) e.location = "Search for your town or city and pick it from the list.";
  }
  return e;
};

/** The first step (1–4) with an error, or null. */
export const firstErrorStep = (e: FormErrors): number | null => {
  const keys = Object.keys(e);
  if (keys.some((k) => k === "title" || k === "dates" || k.startsWith("date-"))) return 1;
  if (keys.some((k) => /^(name|vet|meds)-/.test(k))) return 2;
  if (keys.some((k) => k === "home_type" || k === "location")) return 4;
  return null;
};

/** Form state and edits, shared by Create and Edit. */
export const useListingForm = (initial?: ListingFormData | null) => {
  const [formData, setFormData] = useState<ListingFormData>(initial ?? emptyListingForm());
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  const updateFormData = useCallback((data: Partial<ListingFormData>) => setFormData((prev) => ({ ...prev, ...data })), []);

  const addPet = () => {
    const pet = newPet();
    setFormData((prev) => ({ ...prev, pets: [...prev.pets, pet] }));
    return pet.id;
  };
  const updatePet = (id: string, data: Partial<Pet>) =>
    setFormData((prev) => ({ ...prev, pets: prev.pets.map((p) => (p.id === id ? { ...p, ...data } : p)) }));
  const removePet = (id: string) => setFormData((prev) => ({ ...prev, pets: prev.pets.filter((p) => p.id !== id) }));

  const addSitDate = () => setFormData((prev) => ({ ...prev, sit_dates: [...prev.sit_dates, newSitDate()] }));
  const updateSitDate = (id: string, data: Partial<SitDate>) =>
    setFormData((prev) => ({ ...prev, sit_dates: prev.sit_dates.map((d) => (d.id === id ? { ...d, ...data } : d)) }));
  const removeSitDate = (id: string) => setFormData((prev) => ({ ...prev, sit_dates: prev.sit_dates.filter((d) => d.id !== id) }));

  return {
    formData,
    setFormData,
    currentStep,
    setCurrentStep,
    updateFormData,
    addPet,
    updatePet,
    removePet,
    addSitDate,
    updateSitDate,
    removeSitDate,
  };
};
