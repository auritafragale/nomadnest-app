import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The signed-in member's first name, avatar and Founding status, for the
 * desktop account menu. The same two read functions as Settings (the
 * member's own rows only), cached so the top bar doesn't refetch per page.
 */
export const useAccountSummary = (enabled = true) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["account-summary", user?.id],
    queryFn: async () => {
      const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase.rpc("get_my_profile"),
        supabase.rpc("get_my_membership"),
      ]);
      const p = (profile ?? {}) as { first_name?: string | null; avatar_url?: string | null };
      const m = (Array.isArray(membership) ? membership[0] : membership) as { founding_member?: boolean } | null;
      return {
        firstName: (p.first_name ?? "").trim(),
        avatar: p.avatar_url ?? null,
        founding: !!m?.founding_member,
      };
    },
    enabled: !!user && enabled,
    staleTime: 5 * 60 * 1000,
  });
};
