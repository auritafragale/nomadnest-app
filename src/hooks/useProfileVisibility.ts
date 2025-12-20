import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ProfileVisibility {
  sitterProfileActive: boolean | null;
  ownerProfileActive: boolean | null;
  hasSitterProfile: boolean;
  hasOwnerProfile: boolean;
}

export const useProfileVisibility = () => {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["profile-visibility", user?.id],
    queryFn: async (): Promise<ProfileVisibility> => {
      if (!user) {
        return {
          sitterProfileActive: null,
          ownerProfileActive: null,
          hasSitterProfile: false,
          hasOwnerProfile: false,
        };
      }

      const result: ProfileVisibility = {
        sitterProfileActive: null,
        ownerProfileActive: null,
        hasSitterProfile: false,
        hasOwnerProfile: false,
      };

      // Check sitter profile
      if (role === "sitter" || role === "both") {
        const { data: sitterProfile } = await supabase
          .from("sitter_profiles")
          .select("is_active")
          .eq("user_id", user.id)
          .maybeSingle();

        if (sitterProfile) {
          result.hasSitterProfile = true;
          result.sitterProfileActive = sitterProfile.is_active;
        }
      }

      // Check owner profile
      if (role === "owner" || role === "both") {
        const { data: ownerProfile } = await supabase
          .from("owner_profiles")
          .select("is_active")
          .eq("user_id", user.id)
          .maybeSingle();

        if (ownerProfile) {
          result.hasOwnerProfile = true;
          result.ownerProfileActive = ownerProfile.is_active;
        }
      }

      return result;
    },
    enabled: !!user,
  });
};

export const useUpdateProfileVisibility = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileType,
      isActive,
    }: {
      profileType: "sitter" | "owner";
      isActive: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const table = profileType === "sitter" ? "sitter_profiles" : "owner_profiles";

      const { error } = await supabase
        .from(table)
        .update({ is_active: isActive })
        .eq("user_id", user.id);

      if (error) throw error;

      return { profileType, isActive };
    },
    onSuccess: ({ profileType, isActive }) => {
      queryClient.invalidateQueries({ queryKey: ["profile-visibility"] });
      toast({
        title: isActive ? "Profile activated" : "Profile paused",
        description: isActive
          ? `Your ${profileType} profile is now visible to others`
          : `Your ${profileType} profile is now hidden from public view`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating profile visibility",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });
};
