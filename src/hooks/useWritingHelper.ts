import { useMutation, useQuery } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export type WritingKind = "listing_title" | "listing_description" | "nomad_bio" | "parent_bio";

/** Non-identifying listing context: never names, address, area, vet or medication. */
export interface ListingContext {
  city?: string | null;
  home_type?: string | null;
  pets?: { type: string; count: number }[];
}

export const AI_SUGGESTION_NOTE = "AI suggestion. Read it and change anything that isn't right.";

const FRIENDLY_ERROR = "Sorry, we couldn't write a suggestion right now. Please try again in a moment.";

/**
 * Help me write it / Polish with AI (writing-helper edge function). Behind
 * ai_writing_helper_enabled; admins can use it while the flag is off (the
 * function enforces the same rule). Only returns text: nothing is saved
 * until the member presses Save.
 */
export const useWritingHelper = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();

  const { data: flagEnabled = false } = useQuery({
    queryKey: ["app-setting", "ai_writing_helper_enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "ai_writing_helper_enabled").maybeSingle();
      return data?.value === true;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const suggest = useMutation({
    mutationFn: async (input: { kind: WritingKind; text: string; context?: ListingContext }) => {
      const { data, error } = await supabase.functions.invoke<{ suggestion?: string }>("writing-helper", {
        body: { kind: input.kind, text: input.text, context: input.context },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null);
          throw new Error(body?.error || FRIENDLY_ERROR);
        }
        throw new Error(FRIENDLY_ERROR);
      }
      if (!data?.suggestion) throw new Error(FRIENDLY_ERROR);
      return data.suggestion;
    },
  });

  return { visible: !!user && (flagEnabled || isAdmin === true), suggest };
};

/** Pet types and counts only, for the listing context. */
export const petContext = (pets: { type: string }[]) => {
  const counts = new Map<string, number>();
  for (const p of pets) if (p.type) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => ({ type, count }));
};
