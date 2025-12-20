import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export const useFavorites = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["favorites", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("favorites")
        .select("listing_id")
        .eq("user_id", user.id);

      if (error) throw error;
      return data.map((f) => f.listing_id);
    },
    enabled: !!user,
  });
};

export const useToggleFavorite = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ listingId, isFavorited }: { listingId: string; isFavorited: boolean }) => {
      if (!user) throw new Error("Must be logged in to save listings");

      if (isFavorited) {
        // Remove from favorites
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("listing_id", listingId);

        if (error) throw error;
      } else {
        // Add to favorites
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, listing_id: listingId });

        if (error) throw error;
      }
    },
    onSuccess: (_, { isFavorited }) => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast({
        title: isFavorited ? "Removed from saved" : "Saved!",
        description: isFavorited
          ? "Listing removed from your saved list"
          : "Listing added to your saved list",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update favorites",
      });
    },
  });
};

export const useFavoritedListings = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["favorited-listings", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: favorites, error: favError } = await supabase
        .from("favorites")
        .select("listing_id")
        .eq("user_id", user.id);

      if (favError) throw favError;
      if (!favorites || favorites.length === 0) return [];

      const listingIds = favorites.map((f) => f.listing_id);

      const { data: listings, error: listingsError } = await supabase
        .from("listings")
        .select(`
          id,
          title,
          description,
          city,
          country,
          area,
          photos,
          amenities,
          status,
          pets (id, name, type),
          sit_dates (id, start_date, end_date, status)
        `)
        .in("id", listingIds)
        .eq("status", "published");

      if (listingsError) throw listingsError;
      return listings || [];
    },
    enabled: !!user,
  });
};
