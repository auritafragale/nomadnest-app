import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { publicProfiles, type PublicProfile } from "@/lib/publicProfile";
import type { Database } from "@/integrations/supabase/types";
import { sendNotification } from "@/lib/notifications";
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
    mutationFn: async ({
      applicationId,
      status,
      sitterUserId,
      listingTitle,
    }: {
      applicationId: string;
      status: ApplicationStatus;
      sitterUserId?: string;
      listingTitle?: string;
    }) => {
      const { data, error } = await supabase
        .from("applications")
        .update({ status })
        .eq("id", applicationId)
        .select()
        .single();

      if (error) throw error;

      // Tell the sitter about a shortlist or decline. The status change has
      // already succeeded, so a notification failure is reported back to the
      // Pet Parent (notified: false) rather than thrown.
      let notified = true;
      if ((status === "declined" || status === "shortlisted") && sitterUserId) {
        notified = await sendNotification({
          type: "application_status",
          recipientUserId: sitterUserId,
          data: {
            listingTitle: listingTitle || "a listing",
            status,
          },
        });
      }

      return { application: data, notified };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-applications"] });
    },
  });
};

export const useAcceptApplication = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    /**
     * Critical steps (throw on failure): accept the application, create the
     * sit. As soon as the sit exists the sitter is notified, BEFORE the
     * follow-up steps, so a later failure can never swallow it. Follow-up
     * steps (book the dates, decline and notify the other applicants) each
     * record a warning instead of aborting; the caller shows them.
     */
    mutationFn: async (application: Application): Promise<{ warnings: string[] }> => {
      if (!user) throw new Error("Not authenticated");
      const listingTitle = application.listing?.title || "a listing";
      const warnings: string[] = [];

      // 1) Accept the application.
      const { error: appError } = await supabase
        .from("applications")
        .update({ status: "accepted" })
        .eq("id", application.id);
      if (appError) {
        console.error("Accept: updating the application failed", appError);
        throw new Error(`Couldn't accept the application: ${appError.message}`);
      }

      // 2) Create the sit.
      const { error: sitError } = await supabase.from("sits").insert({
        listing_id: application.listing_id,
        sit_dates_id: application.sit_dates_id,
        sitter_user_id: application.sitter_user_id,
        owner_user_id: user.id,
        status: "confirmed",
      });
      if (sitError) {
        console.error("Accept: creating the sit failed", sitError);
        throw new Error(`The application was accepted, but the sit couldn't be created: ${sitError.message}`);
      }

      // 3) Tell the accepted sitter right away.
      const sitterNotified = await sendNotification({
        type: "application_status",
        recipientUserId: application.sitter_user_id,
        data: { listingTitle, status: "accepted" },
      });
      if (!sitterNotified) {
        warnings.push("We couldn't notify the sitter. Please send them a message to let them know.");
      }

      // 4) Mark the dates as booked.
      const { error: datesError } = await supabase
        .from("sit_dates")
        .update({ status: "booked" })
        .eq("id", application.sit_dates_id);
      if (datesError) {
        console.error("Accept: marking the dates booked failed", datesError);
        warnings.push(`The dates couldn't be marked as booked (${datesError.message}). Please close them from your listing so no one else applies.`);
      }

      // 5) Decline the other applicants for these dates, and tell each of them.
      const { data: declined, error: declineError } = await supabase
        .from("applications")
        .update({ status: "declined" })
        .eq("sit_dates_id", application.sit_dates_id)
        .neq("id", application.id)
        .in("status", ["applied", "shortlisted"])
        .select("id, sitter_user_id");
      if (declineError) {
        console.error("Accept: declining other applicants failed", declineError);
        warnings.push(`Other applicants for these dates couldn't be declined (${declineError.message}). Please decline them from this page.`);
      } else if (declined && declined.length > 0) {
        const results = await Promise.all(
          declined.map((row) =>
            sendNotification({
              type: "application_status",
              recipientUserId: row.sitter_user_id,
              data: { listingTitle, status: "declined" },
            }),
          ),
        );
        const failed = results.filter((ok) => !ok).length;
        if (failed > 0) {
          warnings.push(`${failed} declined applicant${failed === 1 ? "" : "s"} couldn't be notified.`);
        }
      }

      return { warnings };
    },
    // Refresh even after a failure: a step may have succeeded before it.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-applications"] });
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
      queryClient.invalidateQueries({ queryKey: ["sits"] });
    },
  });
};
