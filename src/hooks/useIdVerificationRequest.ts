import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type IdVerificationStatus = "pending" | "approved" | "rejected";

export interface IdVerificationRequest {
  id: string;
  status: IdVerificationStatus;
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/** Most recent manual ID verification submission for the signed-in member. */
export const useIdVerificationRequest = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["id-verification-request", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manual_id_verifications")
        .select("id, status, notes, created_at, reviewed_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as IdVerificationRequest | null) ?? null;
    },
  });
};
