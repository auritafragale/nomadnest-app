import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

type ListingStatus = "draft" | "published" | "paused";

export const useUpdateListingStatus = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ listingId, status }: { listingId: string; status: ListingStatus }) => {
      const { error } = await supabase
        .from("listings")
        .update({ status })
        .eq("id", listingId)
        .eq("owner_user_id", user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
    },
  });
};

export const useDeleteListing = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (listingId: string) => {
      const { error } = await supabase
        .from("listings")
        .delete()
        .eq("id", listingId)
        .eq("owner_user_id", user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
      toast({
        title: "Listing deleted",
        description: "Your listing has been permanently removed.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete listing",
      });
    },
  });
};
