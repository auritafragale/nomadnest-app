import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

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

      // Enrich with sitter profiles and user data
      const enrichedApplications = await Promise.all(
        (applications || []).map(async (app) => {
          const { data: sitterProfile } = await supabase
            .from("sitter_profiles")
            .select("user_id, headline, experience_level, pet_types")
            .eq("user_id", app.sitter_user_id)
            .maybeSingle();

          const { data: sitterUser } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url, city, country")
            .eq("id", app.sitter_user_id)
            .single();

          return {
            ...app,
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
    }: {
      applicationId: string;
      status: ApplicationStatus;
    }) => {
      const { data, error } = await supabase
        .from("applications")
        .update({ status })
        .eq("id", applicationId)
        .select()
        .single();

      if (error) throw error;
      return data;
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
    mutationFn: async (application: Application) => {
      if (!user) throw new Error("Not authenticated");

      // Update application status to accepted
      const { error: appError } = await supabase
        .from("applications")
        .update({ status: "accepted" })
        .eq("id", application.id);

      if (appError) throw appError;

      // Create a sit record
      const { error: sitError } = await supabase.from("sits").insert({
        listing_id: application.listing_id,
        sit_dates_id: application.sit_dates_id,
        sitter_user_id: application.sitter_user_id,
        owner_user_id: user.id,
        status: "confirmed",
      });

      if (sitError) throw sitError;

      // Update sit_dates status to booked
      const { error: datesError } = await supabase
        .from("sit_dates")
        .update({ status: "booked" })
        .eq("id", application.sit_dates_id);

      if (datesError) throw datesError;

      // Decline other applications for same sit_dates
      await supabase
        .from("applications")
        .update({ status: "declined" })
        .eq("sit_dates_id", application.sit_dates_id)
        .neq("id", application.id)
        .in("status", ["applied", "shortlisted"]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-applications"] });
    },
  });
};
