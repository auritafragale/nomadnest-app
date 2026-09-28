import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export interface DateRange {
  start: string;
  end: string;
}

/**
 * The Nomad's own upcoming availability (sitter_availability). Until the
 * Stage 2 migration is applied the table doesn't exist: the query reports
 * `unavailable` instead of failing the page.
 */
export const useMyAvailability = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-availability", user?.id],
    queryFn: async (): Promise<{ ranges: DateRange[]; unavailable: boolean }> => {
      const { data, error } = await supabase
        .from("sitter_availability")
        .select("start_date, end_date")
        .eq("sitter_user_id", user!.id)
        .gte("end_date", new Date().toISOString().slice(0, 10))
        .order("start_date");
      if (error) return { ranges: [], unavailable: true };
      return { ranges: (data ?? []).map((r) => ({ start: r.start_date, end: r.end_date })), unavailable: false };
    },
    enabled: !!user,
  });
};

export const useSaveAvailability = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ranges: DateRange[]) => {
      const { data, error } = await supabase.rpc("set_my_availability", { p_ranges: ranges as unknown as never });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DateRange[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-availability", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["sitter-free-dates"] });
    },
  });
};

/**
 * A Nomad's free dates as other members see them (booked days removed).
 * null when the function isn't available yet (before the migration).
 */
export const useSitterFreeDates = (sitterId: string | undefined) =>
  useQuery({
    queryKey: ["sitter-free-dates", sitterId],
    queryFn: async (): Promise<(DateRange & { days: number })[] | null> => {
      const { data, error } = await supabase.rpc("get_sitter_free_dates", { p_sitter_id: sitterId! });
      if (error) return null;
      return (data ?? []) as unknown as (DateRange & { days: number })[];
    },
    enabled: !!sitterId,
  });

/** "Suggest my dates" is behind app_settings.availability_ai_enabled; admins can use it while it's off. */
export const useAvailabilityAiAvailable = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { data: flagEnabled = false } = useQuery({
    queryKey: ["app-setting", "availability_ai_enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "availability_ai_enabled").maybeSingle();
      return data?.value === true;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  return !!user && (flagEnabled || isAdmin === true);
};

export interface DateSuggestion extends DateRange {
  why: string;
}

export const useSuggestDates = () =>
  useMutation({
    mutationFn: async (): Promise<DateSuggestion[]> => {
      const { data, error } = await supabase.functions.invoke("suggest-availability", { body: {} });
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.error || "Suggestions aren't available right now.");
      }
      return ((data as { suggestions?: DateSuggestion[] })?.suggestions ?? []) as DateSuggestion[];
    },
  });
