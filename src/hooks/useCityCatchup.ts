import { useMutation, useQuery } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const FRIENDLY_ERROR = "Sorry, we couldn't catch you up right now. Please try again in a moment.";

/**
 * "✦ Catch me up" (city-chat-catchup edge function). Behind
 * ai_city_catchup_enabled; admins can use it while the flag is off (the
 * function enforces the same rule and the daily limit). Nothing is stored.
 */
export const useCityCatchup = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();

  const { data: flagEnabled = false } = useQuery({
    queryKey: ["app-setting", "ai_city_catchup_enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "ai_city_catchup_enabled").maybeSingle();
      return data?.value === true;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const catchUp = useMutation({
    mutationFn: async (input: { roomId: string; since: string | null }) => {
      const { data, error } = await supabase.functions.invoke<{ bullets?: string[]; days?: number }>("city-chat-catchup", {
        body: { room_id: input.roomId, since: input.since },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null);
          throw new Error(body?.error || FRIENDLY_ERROR);
        }
        throw new Error(FRIENDLY_ERROR);
      }
      return { bullets: data?.bullets ?? [], days: data?.days ?? 1 };
    },
  });

  return { visible: !!user && (flagEnabled || isAdmin === true), catchUp };
};
