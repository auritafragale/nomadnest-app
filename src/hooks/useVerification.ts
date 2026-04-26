import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useVerification = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["verification", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id_verified, onfido_applicant_id, onfido_check_id")
        .eq("id", user!.id)
        .single();

      if (error) throw error;
      return data as {
        id_verified: boolean | null;
        onfido_applicant_id: string | null;
        onfido_check_id: string | null;
      };
    },
  });
};
