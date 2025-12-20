import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type ApplicationStatus = Database["public"]["Enums"]["application_status"];

export interface SitterApplication {
  id: string;
  listing_id: string;
  sit_dates_id: string;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  listing: {
    id: string;
    title: string;
    city: string | null;
    country: string | null;
    photos: string[] | null;
  } | null;
  sit_dates: {
    id: string;
    start_date: string;
    end_date: string;
  } | null;
  owner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

export const useSitterApplications = (statusFilter?: ApplicationStatus | "all") => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["sitter-applications", user?.id, statusFilter],
    queryFn: async (): Promise<SitterApplication[]> => {
      if (!user) return [];

      let query = supabase
        .from("applications")
        .select(`
          id,
          listing_id,
          sit_dates_id,
          status,
          message,
          created_at,
          listings:listing_id (id, title, city, country, photos, owner_user_id),
          sit_dates:sit_dates_id (id, start_date, end_date)
        `)
        .eq("sitter_user_id", user.id)
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch owner profiles
      const enrichedApplications = await Promise.all(
        (data || []).map(async (app) => {
          const listing = app.listings as any;
          let owner = null;

          if (listing?.owner_user_id) {
            const { data: ownerData } = await supabase
              .from("profiles")
              .select("id, first_name, last_name, avatar_url")
              .eq("id", listing.owner_user_id)
              .single();
            owner = ownerData;
          }

          return {
            id: app.id,
            listing_id: app.listing_id,
            sit_dates_id: app.sit_dates_id,
            status: app.status,
            message: app.message,
            created_at: app.created_at,
            listing: listing ? {
              id: listing.id,
              title: listing.title,
              city: listing.city,
              country: listing.country,
              photos: listing.photos,
            } : null,
            sit_dates: app.sit_dates as any,
            owner,
          };
        })
      );

      return enrichedApplications;
    },
    enabled: !!user,
  });
};
