import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { publicProfiles, type PublicProfile } from "@/lib/publicProfile";
import type { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";

type ApplicationStatus = Database["public"]["Enums"]["application_status"];

export interface Application {
  id: string;
  listing_id: string;
  sit_dates_id: string;
  sitter_user_id: string;
  status: ApplicationStatus;
  message: string | null;
  who_applying: string | null;
  highlights: string[] | null;
  created_at: string;
  updated_at: string;
  listing: {
    id: string;
    title: string;
    city: string | null;
    country: string | null;
  } | null;
  sit_dates: {
    id: string;
    start_date: string;
    end_date: string;
  } | null;
  sitter_profile: {
    user_id: string;
    headline: string | null;
    experience_level: string | null;
    pet_types: string[] | null;
  } | null;
  /** How many reviews this Nomad has received, and their average score */
  review_count: number;
  avg_rating: number | null;
  sitter_user: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    city: string | null;
    country: string | null;
  } | null;
}

export const useOwnerApplications = (statusFilter?: ApplicationStatus | "all") => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["owner-applications", user?.id, statusFilter],
    queryFn: async (): Promise<Application[]> => {
      if (!user) return [];

      // First get all listings owned by the user
      const { data: listings, error: listingsError } = await supabase
        .from("listings")
        .select("id")
        .eq("owner_user_id", user.id);

      if (listingsError) throw listingsError;
      if (!listings?.length) return [];

      const listingIds = listings.map((l) => l.id);

      // Get applications for those listings
      let query = supabase
        .from("applications")
        .select(`
          *,
          listings:listing_id (id, title, city, country),
          sit_dates:sit_dates_id (id, start_date, end_date)
        `)
        .in("listing_id", listingIds)
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data: applications, error } = await query;
      if (error) throw error;

      // One trip for every review score these Nomads have received
      const sitterIds = Array.from(new Set((applications || []).map((a) => a.sitter_user_id)));
      const { data: reviewRows } = await supabase
        .from("reviews")
        .select("reviewee_user_id, rating")
        .in("reviewee_user_id", sitterIds.length ? sitterIds : ["00000000-0000-0000-0000-000000000000"]);

      const reviewStats = new Map<string, { count: number; total: number }>();
      (reviewRows || []).forEach((r) => {
        const current = reviewStats.get(r.reviewee_user_id) || { count: 0, total: 0 };
        reviewStats.set(r.reviewee_user_id, {
          count: current.count + 1,
          total: current.total + (r.rating || 0),
        });
      });

      // Enrich with sitter profiles and user data
      const enrichedApplications = await Promise.all(
        (applications || []).map(async (app) => {
          const { data: sitterProfile } = await supabase
            .from("sitter_profiles")
            .select("user_id, headline, experience_level, pet_types")
            .eq("user_id", app.sitter_user_id)
            .maybeSingle();

          const { data: sitterUser } = await publicProfiles("id, first_name, last_name, avatar_url, city, country")
            .eq("id", app.sitter_user_id)
            .maybeSingle() as { data: PublicProfile | null };

          const stats = reviewStats.get(app.sitter_user_id);

          return {
            ...app,
            review_count: stats?.count ?? 0,
            avg_rating: stats && stats.count > 0 ? stats.total / stats.count : null,
            listing: app.listings,
            sit_dates: app.sit_dates,
            sitter_profile: sitterProfile,
            sitter_user: sitterUser,
          };
        })
      );

      return enrichedApplications;
    },
    enabled: !!user,
  });
};

export const useUpdateApplicationStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    /**
     * Shortlist or decline through the database (shortlist_application /
     * decline_application): the status change and the sitter's notification
     * happen in one transaction; the push and email follow automatically.
     */
    mutationFn: async ({
      applicationId,
      status,
    }: {
      applicationId: string;
      status: "shortlisted" | "declined";
    }) => {
      const { data, error } = await supabase.rpc(
        status === "shortlisted" ? "shortlist_application" : "decline_application",
        { p_application_id: applicationId },
      );
      if (error) throw new Error(error.message);
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-applications"] });
    },
  });
};

export const useAcceptApplication = () => {
  const queryClient = useQueryClient();

  return useMutation({
    /**
     * Accept through the database (accept_application): accepting, creating
     * the sit, booking the dates, declining the other applicants and every
     * notification happen in one transaction — all or nothing. Pushes and
     * emails follow automatically.
     */
    mutationFn: async (application: Application) => {
      const { data, error } = await supabase.rpc("accept_application", {
        p_application_id: application.id,
      });
      if (error) throw new Error(error.message);
      const result = (data ?? {}) as { sit_id?: string; declined_count?: number };
      return { sitId: result.sit_id ?? null, declinedCount: result.declined_count ?? 0 };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-applications"] });
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
      queryClient.invalidateQueries({ queryKey: ["sits"] });
    },
  });
};
