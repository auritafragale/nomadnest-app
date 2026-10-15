import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isQuietAuthError } from "@/lib/signInCheck";

type Verification = {
  id_verified: boolean | null;
  onfido_applicant_id: string | null;
  onfido_check_id: string | null;
};

export const useVerification = () => {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["verification", user?.id],
    enabled: !!session && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_verification");

      if (error) {
        // While the session refreshes, keep what we had (never a false "not
        // verified"); with nothing yet, an unknown state.
        if (isQuietAuthError(error)) {
          return queryClient.getQueryData<Verification>(["verification", user?.id]) ?? { id_verified: null, onfido_applicant_id: null, onfido_check_id: null };
        }
        throw error;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? { id_verified: null, onfido_applicant_id: null, onfido_check_id: null }) as Verification;

    },
  });
};
