import { useMutation, useQuery } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const FRIENDLY_ERROR = "Sorry, we couldn't draft your invitation right now. Please try again in a moment, or write it yourself.";

/**
 * "Help me write it" in the invite panel: behind ai_invite_cowriter_enabled
 * (admins can use it while it's off — the edge function enforces the same
 * rule). Returns text only; the Pet Parent edits and sends it themselves.
 */
export const useInviteCowriter = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();

  const { data: flagEnabled = false } = useQuery({
    queryKey: ["app-setting", "ai_invite_cowriter_enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "ai_invite_cowriter_enabled").maybeSingle();
      return data?.value === true;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const draft = useMutation({
    mutationFn: async (input: { listingId: string; sitterUserId: string; sitDateIds: string[] }) => {
      const { data, error } = await supabase.functions.invoke<{ draft?: string }>("draft-invitation", {
        body: { listing_id: input.listingId, sitter_user_id: input.sitterUserId, sit_date_ids: input.sitDateIds.length ? input.sitDateIds : undefined },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null);
          throw new Error(body?.error || FRIENDLY_ERROR);
        }
        throw new Error(FRIENDLY_ERROR);
      }
      if (!data?.draft) throw new Error(FRIENDLY_ERROR);
      return data.draft;
    },
  });

  return { visible: !!user && (flagEnabled || isAdmin === true), draft };
};
