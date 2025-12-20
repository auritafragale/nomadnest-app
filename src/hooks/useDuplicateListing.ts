import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export const useDuplicateListing = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (listingId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Fetch original listing
      const { data: original, error: fetchError } = await supabase
        .from("listings")
        .select("*")
        .eq("id", listingId)
        .single();

      if (fetchError) throw fetchError;

      // Create new listing with same data (as draft)
      const { data: newListing, error: createError } = await supabase
        .from("listings")
        .insert({
          owner_user_id: user.id,
          title: `${original.title} (Copy)`,
          description: original.description,
          city: original.city,
          country: original.country,
          area: original.area,
          address_private: original.address_private,
          photos: original.photos,
          home_type: original.home_type,
          sleeping_arrangement: original.sleeping_arrangement,
          wifi_quality: original.wifi_quality,
          amenities: original.amenities,
          house_rules: original.house_rules,
          house_rules_other: original.house_rules_other,
          requirements: original.requirements,
          requirements_other: original.requirements_other,
          home_care_tasks: original.home_care_tasks,
          home_care_tasks_other: original.home_care_tasks_other,
          communication_style: original.communication_style,
          ideal_sitter_description: original.ideal_sitter_description,
          status: "draft",
        })
        .select()
        .single();

      if (createError) throw createError;

      // Fetch and duplicate pets
      const { data: pets } = await supabase
        .from("pets")
        .select("*")
        .eq("listing_id", listingId);

      if (pets && pets.length > 0) {
        const newPets = pets.map((pet) => ({
          listing_id: newListing.id,
          type: pet.type,
          name: pet.name,
          age: pet.age,
          personality: pet.personality,
          daily_routine: pet.daily_routine,
          feeding_details: pet.feeding_details,
          walks_exercise: pet.walks_exercise,
          has_medication: pet.has_medication,
          medication_instructions: pet.medication_instructions,
          vet_info: pet.vet_info,
          photos: pet.photos,
        }));

        await supabase.from("pets").insert(newPets);
      }

      return newListing;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
      toast({
        title: "Listing duplicated",
        description: "A copy of your listing has been created as a draft.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error duplicating listing",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
