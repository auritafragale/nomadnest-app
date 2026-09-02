import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useVerification = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["verification", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_verification");

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? { id_verified: null, onfido_applicant_id: null, onfido_check_id: null }) as {
        id_verified: boolean | null;
        onfido_applicant_id: string | null;
        onfido_check_id: string | null;
      };

    },
  });
};
