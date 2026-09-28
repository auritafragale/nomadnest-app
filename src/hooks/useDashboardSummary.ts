import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SitRole = "owner" | "sitter";

export interface CurrentSit {
  sit_id: string;
  role: SitRole;
  listing_id: string | null;
  listing_title: string;
  city: string | null;
  other_first_name: string;
  start_date: string;
  end_date: string;
  day_number: number;
  total_days: number;
  due_today: boolean;
  sent_today: boolean;
}

export interface NextSit {
  sit_id: string;
  role: SitRole;
  listing_id: string | null;
  listing_title: string;
  city: string | null;
  other_first_name: string;
  start_date: string;
  end_date: string;
}

export interface DashboardSummary {
  current_sits: CurrentSit[];
  next_sits: NextSit[];
  new_applicants: { listing_id: string; listing_title: string; count: number }[];
  pending_invites: number;
  reviews_due: { sit_id: string; role: SitRole; listing_title: string; other_first_name: string; days_left: number }[];
}

const EMPTY: DashboardSummary = {
  current_sits: [],
  next_sits: [],
  new_applicants: [],
  pending_invites: 0,
  reviews_due: [],
};

/** The caller's own dashboard summary (get_my_dashboard_summary). */
export const useDashboardSummary = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard-summary", user?.id],
    queryFn: async (): Promise<DashboardSummary> => {
      const { data, error } = await supabase.rpc("get_my_dashboard_summary");
      if (error) throw error;
      return { ...EMPTY, ...((data ?? {}) as Partial<DashboardSummary>) };
    },
    enabled: !!user,
    refetchInterval: 5 * 60_000,
  });
};
