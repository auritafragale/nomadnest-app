import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ListingFormData, Pet, SitDate } from "./useListingForm";

export interface DatabasePet {
  id: string;
  name: string | null;
  type: string;
  age: string | null;
  personality: string | null;
  feeding_details: string | null;
  daily_routine: string | null;
  walks_exercise: string | null;
  has_medication: boolean | null;
  medication_instructions: string | null;
  vet_info: string | null;
  photos: string[] | null;
}

export interface DatabaseSitDate {
  id: string;
  start_date: string;
  end_date: string;
  flexibility: string | null;
  handover_preference: string | null;
  status: string;
}

export interface ListingWithDetails {
  id: string;
  title: string;
  description: string | null;
  status: string;
  home_type: string | null;
  city: string | null;
  country: string | null;
  area: string | null;
  wifi_quality: string | null;
  sleeping_arrangement: string | null;
  amenities: string[] | null;
  photos: string[] | null;
  requirements: string[] | null;
  requirements_other: string | null;
  house_rules: string[] | null;
  house_rules_other: string | null;
  home_care_tasks: string[] | null;
  home_care_tasks_other: string | null;
  ideal_sitter_description: string | null;
  communication_style: string | null;
  pets: DatabasePet[];
  sit_dates: DatabaseSitDate[];
}

export const useListingDetails = (listingId: string | undefined) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["listing-details", listingId],
    queryFn: async () => {
      if (!listingId) throw new Error("Listing ID required");

      const { data: listing, error: listingError } = await supabase
        .from("listings")
        .select("*")
        .eq("id", listingId)
        .single();

      if (listingError) throw listingError;

      // Verify ownership
      if (listing.owner_user_id !== user?.id) {
        throw new Error("You don't have permission to edit this listing");
      }

      const { data: pets, error: petsError } = await supabase
        .from("pets")
        .select("*")
        .eq("listing_id", listingId);

      if (petsError) throw petsError;

      const { data: sitDates, error: datesError } = await supabase
        .from("sit_dates")
        .select("*")
        .eq("listing_id", listingId);

      if (datesError) throw datesError;

      return {
        ...listing,
        pets: pets || [],
        sit_dates: sitDates || [],
      } as ListingWithDetails;
    },
    enabled: !!listingId && !!user,
  });
};

export const useUpdateListing = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listingId,
      formData,
      status,
      originalPetIds,
      originalSitDateIds,
    }: {
      listingId: string;
      formData: ListingFormData;
      status: "draft" | "published" | "paused";
      originalPetIds: string[];
      originalSitDateIds: string[];
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Update the listing
      const { error: listingError } = await supabase
        .from("listings")
        .update({
          title: formData.title,
          description: formData.description,
          status,
          home_type: formData.home_type || null,
          city: formData.city,
          country: formData.country,
          area: formData.area || null,
          wifi_quality: formData.wifi_quality || null,
          sleeping_arrangement: formData.sleeping_arrangement || null,
          amenities: formData.amenities,
          photos: formData.photos,
          requirements: formData.requirements,
          requirements_other: formData.requirements_other || null,
          house_rules: formData.house_rules,
          house_rules_other: formData.house_rules_other || null,
          home_care_tasks: formData.home_care_tasks,
          home_care_tasks_other: formData.home_care_tasks_other || null,
          ideal_sitter_description: formData.ideal_sitter_description || null,
          communication_style: formData.communication_style || null,
        })
        .eq("id", listingId);

      if (listingError) throw listingError;

      // Handle pets - delete removed, update existing, insert new
      const currentPetIds = formData.pets
        .map((p) => p.id)
        .filter((id) => originalPetIds.includes(id));
      const petsToDelete = originalPetIds.filter(
        (id) => !currentPetIds.includes(id)
      );

      if (petsToDelete.length > 0) {
        const { error: deletePetsError } = await supabase
          .from("pets")
          .delete()
          .in("id", petsToDelete);
        if (deletePetsError) throw deletePetsError;
      }

      for (const pet of formData.pets) {
        if (originalPetIds.includes(pet.id)) {
          // Update existing pet
          const { error: updatePetError } = await supabase
            .from("pets")
            .update({
              name: pet.name,
              type: pet.type,
              age: pet.age || null,
              personality: pet.personality || null,
              feeding_details: pet.feeding_details || null,
              daily_routine: pet.daily_routine || null,
              walks_exercise: pet.walks_exercise || null,
              has_medication: pet.has_medication,
              medication_instructions: pet.medication_instructions || null,
              vet_info: pet.vet_info || null,
              photos: pet.photos,
            })
            .eq("id", pet.id);
          if (updatePetError) throw updatePetError;
        } else {
          // Insert new pet
          const { error: insertPetError } = await supabase.from("pets").insert({
            listing_id: listingId,
            name: pet.name,
            type: pet.type,
            age: pet.age || null,
            personality: pet.personality || null,
            feeding_details: pet.feeding_details || null,
            daily_routine: pet.daily_routine || null,
            walks_exercise: pet.walks_exercise || null,
            has_medication: pet.has_medication,
            medication_instructions: pet.medication_instructions || null,
            vet_info: pet.vet_info || null,
            photos: pet.photos,
          });
          if (insertPetError) throw insertPetError;
        }
      }

      // Handle sit dates - delete removed, update existing, insert new
      const currentSitDateIds = formData.sit_dates
        .map((d) => d.id)
        .filter((id) => originalSitDateIds.includes(id));
      const datesToDelete = originalSitDateIds.filter(
        (id) => !currentSitDateIds.includes(id)
      );

      if (datesToDelete.length > 0) {
        const { error: deleteDatesError } = await supabase
          .from("sit_dates")
          .delete()
          .in("id", datesToDelete);
        if (deleteDatesError) throw deleteDatesError;
      }

      for (const date of formData.sit_dates) {
        if (originalSitDateIds.includes(date.id)) {
          // Update existing date
          const { error: updateDateError } = await supabase
            .from("sit_dates")
            .update({
              start_date: date.start_date,
              end_date: date.end_date,
              flexibility: date.flexibility || null,
              handover_preference: date.handover_preference || null,
            })
            .eq("id", date.id);
          if (updateDateError) throw updateDateError;
        } else {
          // Insert new date
          const { error: insertDateError } = await supabase
            .from("sit_dates")
            .insert({
              listing_id: listingId,
              start_date: date.start_date,
              end_date: date.end_date,
              flexibility: date.flexibility || null,
              handover_preference: date.handover_preference || null,
            });
          if (insertDateError) throw insertDateError;
        }
      }

      return { listingId, status };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["listing-details", variables.listingId] });
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
      toast({
        title: "Listing updated!",
        description: "Your changes have been saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating listing",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Convert database data to form format
export const convertToFormData = (listing: ListingWithDetails): ListingFormData => {
  return {
    title: listing.title,
    description: listing.description || "",
    pets: listing.pets.map((pet) => ({
      id: pet.id,
      name: pet.name || "",
      type: pet.type,
      age: pet.age || "",
      personality: pet.personality || "",
      feeding_details: pet.feeding_details || "",
      daily_routine: pet.daily_routine || "",
      walks_exercise: pet.walks_exercise || "",
      has_medication: pet.has_medication || false,
      medication_instructions: pet.medication_instructions || "",
      vet_info: pet.vet_info || "",
      photos: pet.photos || [],
    })),
    sit_dates: listing.sit_dates.map((date) => ({
      id: date.id,
      start_date: date.start_date,
      end_date: date.end_date,
      flexibility: date.flexibility || "fixed",
      handover_preference: date.handover_preference || "flexible",
    })),
    home_type: listing.home_type || "",
    city: listing.city || "",
    country: listing.country || "",
    area: listing.area || "",
    wifi_quality: listing.wifi_quality || "",
    sleeping_arrangement: listing.sleeping_arrangement || "",
    amenities: listing.amenities || [],
    photos: listing.photos || [],
    requirements: listing.requirements || [],
    requirements_other: listing.requirements_other || "",
    house_rules: listing.house_rules || [],
    house_rules_other: listing.house_rules_other || "",
    home_care_tasks: listing.home_care_tasks || [],
    home_care_tasks_other: listing.home_care_tasks_other || "",
    ideal_sitter_description: listing.ideal_sitter_description || "",
    communication_style: listing.communication_style || "",
  };
};
