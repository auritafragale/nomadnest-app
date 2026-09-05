import { useState, useEffect } from "react";

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
}

export interface ListingFormData {
  // Step 1: Basic Info
  title: string;
  description: string;
  
  // Step 2: Pets
  pets: Pet[];
  
  // Step 3: Dates
  sit_dates: SitDate[];
  
  // Step 4: Home Info
  home_type: string;
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
  
  // Step 5: Requirements
  requirements: string[];
  requirements_other: string;
  house_rules: string[];
  house_rules_other: string;
  home_care_tasks: string[];
  home_care_tasks_other: string;
  ideal_sitter_description: string;
  communication_style: string;
}

const initialPet: Pet = {
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
};

const initialSitDate: SitDate = {
  id: crypto.randomUUID(),
  start_date: "",
  end_date: "",
  flexibility: "fixed",
  handover_preference: "flexible",
};

const initialFormData: ListingFormData = {
  title: "",
  description: "",
  pets: [{ ...initialPet }],
  sit_dates: [{ ...initialSitDate }],
  home_type: "",
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
  requirements: [],
  requirements_other: "",
  house_rules: [],
  house_rules_other: "",
  home_care_tasks: [],
  home_care_tasks_other: "",
  ideal_sitter_description: "",
  communication_style: "",
};

export const useListingForm = () => {
  const [formData, setFormData] = useState<ListingFormData>(initialFormData);
  const [currentStep, setCurrentStep] = useState(1);

  const totalSteps = 5;

  const updateFormData = (data: Partial<ListingFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  const addPet = () => {
    setFormData((prev) => ({
      ...prev,
      pets: [...prev.pets, { ...initialPet, id: crypto.randomUUID() }],
    }));
  };

  const updatePet = (id: string, data: Partial<Pet>) => {
    setFormData((prev) => ({
      ...prev,
      pets: prev.pets.map((pet) =>
        pet.id === id ? { ...pet, ...data } : pet
      ),
    }));
  };

  const removePet = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      pets: prev.pets.filter((pet) => pet.id !== id),
    }));
  };

  const addSitDate = () => {
    setFormData((prev) => ({
      ...prev,
      sit_dates: [...prev.sit_dates, { ...initialSitDate, id: crypto.randomUUID() }],
    }));
  };

  const updateSitDate = (id: string, data: Partial<SitDate>) => {
    setFormData((prev) => ({
      ...prev,
      sit_dates: prev.sit_dates.map((date) =>
        date.id === id ? { ...date, ...data } : date
      ),
    }));
  };

  const removeSitDate = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      sit_dates: prev.sit_dates.filter((date) => date.id !== id),
    }));
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= totalSteps) {
      setCurrentStep(step);
    }
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setCurrentStep(1);
  };

  return {
    formData,
    currentStep,
    totalSteps,
    updateFormData,
    addPet,
    updatePet,
    removePet,
    addSitDate,
    updateSitDate,
    removeSitDate,
    nextStep,
    prevStep,
    goToStep,
    resetForm,
  };
};
