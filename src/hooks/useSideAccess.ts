import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SideAccess {
  /** Nomad side: apply, accept invitations. */
  sitter: boolean;
  /** Pet Parent side: publish and show listings, invite, accept applicants. */
  owner: boolean;
  /** The last payment failed and Stripe is still retrying. */
  pastDue: boolean;
  /** Update the card by this date to keep the membership (a week after the first failed payment). */
  retryUntil: string | null;
}

/**
 * The member's own access, from the one database rule (has_side_access):
 * Founding, or a membership for that side that is active, or past due
 * during the retry week.
 */
export const useSideAccess = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["side-access", user?.id],
    queryFn: async (): Promise<SideAccess> => {
      const { data, error } = await supabase.rpc("get_my_side_access");
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        | { sitter: boolean; owner: boolean; past_due: boolean; retry_until: string | null }
        | undefined;
      return { sitter: !!row?.sitter, owner: !!row?.owner, pastDue: !!row?.past_due, retryUntil: row?.retry_until ?? null };
    },
    enabled: !!user,
    staleTime: 60_000,
  });
};
