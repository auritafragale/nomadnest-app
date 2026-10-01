import { useQuery } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export interface NomadMatch {
  user_id: string;
  reason: string;
}

const FRIENDLY_ERROR = "Sorry, we couldn't sort Nomads for your sit right now. Please try again in a moment.";

/**
 * "Best match for your [city] sit" on Browse Nomads: shown to Pet Parents
 * whose published listing has open dates, when ai_nomad_match_enabled is on
 * (or to admins while it's off — the edge function enforces the same rule).
 * The nomad-match function sorts and caches per listing for 24 hours.
 */
export const useNomadMatch = (on: boolean) => {
  const { user, role } = useAuth();
  const { isAdmin } = useIsAdmin();
  const isOwnerRole = role === "owner" || role === "both";

  const { data: flagEnabled = false } = useQuery({
    queryKey: ["app-setting", "ai_nomad_match_enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "ai_nomad_match_enabled").maybeSingle();
      return data?.value === true;
    },
    enabled: !!user && isOwnerRole,
    staleTime: 5 * 60 * 1000,
  });
  const allowed = !!user && isOwnerRole && (flagEnabled || isAdmin === true);

  // The owner's published listing with the soonest open dates.
  const { data: listing = null } = useQuery({
    queryKey: ["nomad-match-listing", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("listings")
        .select("id, city, sit_dates!inner(start_date, end_date, status)")
        .eq("owner_user_id", user!.id)
        .eq("status", "published")
        .eq("sit_dates.status", "open")
        .gte("sit_dates.end_date", today);
      const rows = (data ?? []) as { id: string; city: string | null; sit_dates: { start_date: string }[] }[];
      const soonest = (r: (typeof rows)[number]) => r.sit_dates.map((d) => d.start_date).sort()[0] ?? "9999";
      const best = rows.sort((a, b) => soonest(a).localeCompare(soonest(b)))[0];
      return best ? { id: best.id, city: best.city } : null;
    },
    enabled: allowed,
  });

  const visible = allowed && !!listing;

  const match = useQuery({
    queryKey: ["nomad-match", listing?.id],
    queryFn: async (): Promise<NomadMatch[]> => {
      const { data, error } = await supabase.functions.invoke<{ results?: NomadMatch[] }>("nomad-match", {
        body: { listing_id: listing!.id },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null);
          throw new Error(body?.error || FRIENDLY_ERROR);
        }
        throw new Error(FRIENDLY_ERROR);
      }
      return Array.isArray(data?.results) ? data.results : [];
    },
    enabled: visible && on,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  return { visible, city: listing?.city ?? null, match };
};
