import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SITTER_PROFILE_COLUMNS } from "@/lib/profileColumns";

export const useSitterPreferences = () => {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["sitter-preferences", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("sitter_profiles")
        .select(SITTER_PROFILE_COLUMNS as "*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user && (role === "sitter" || role === "both"),
  });
};

export const useSitterPreferredLocations = () => {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["sitter-preferred-locations", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("sitter_profiles")
        .select("preferred_regions, preferred_countries, preferred_cities")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user && (role === "sitter" || role === "both"),
  });
};
