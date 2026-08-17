import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ListingFilters {
  search?: string;
  petTypes?: string[];
  startDate?: string;
  endDate?: string;
  countries?: string[];
  cities?: string[];
  sortBy?: "newest" | "soonest";
  lastMinute?: boolean;
  reasonsForSit?: string[];
}

export interface ListingWithDetails {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  country: string | null;
  area: string | null;
  photos: string[];
  amenities: string[];
  status: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  owner_user_id: string;
  pets: {
    id: string;
    name: string | null;
    type: string;
  }[];
  sit_dates: {
    id: string;
    start_date: string;
    end_date: string;
    status: string;
  }[];
  owner_rating?: { average: number; count: number };
  owner_profile?: { first_name: string | null; last_name: string | null; avatar_url: string | null; id_verified?: boolean | null };
  wifi_quality?: string | null;
}

export const useListings = (filters: ListingFilters = {}) => {
  return useQuery({
    queryKey: ["listings", filters],
    queryFn: async (): Promise<ListingWithDetails[]> => {
      let query = supabase
        .from("listings")
        .select(`
          id,
          title,
          description,
          city,
          country,
          area,
          photos,
          amenities,
          wifi_quality,
          status,
          created_at,
          latitude,
          longitude,
          owner_user_id,
          pets (
            id,
            name,
            type
          ),
          sit_dates (
            id,
            start_date,
            end_date,
            status
          )
        `)
        .eq("status", "published");

      // Apply location/title search
      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        query = query.or(`title.ilike.${searchTerm},city.ilike.${searchTerm},country.ilike.${searchTerm},area.ilike.${searchTerm},description.ilike.${searchTerm}`);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      let results = (data || []) as ListingWithDetails[];

      // Fetch owner ratings in bulk
      const ownerIds = [...new Set(results.map((l) => l.owner_user_id))];
      if (ownerIds.length > 0) {
        const { data: reviewData } = await supabase
          .from("reviews")
          .select("reviewee_user_id, rating")
          .in("reviewee_user_id", ownerIds);

        if (reviewData && reviewData.length > 0) {
          const ratingMap = new Map<string, { sum: number; count: number }>();
          reviewData.forEach((r) => {
            const existing = ratingMap.get(r.reviewee_user_id) || { sum: 0, count: 0 };
            ratingMap.set(r.reviewee_user_id, { sum: existing.sum + r.rating, count: existing.count + 1 });
          });
          results = results.map((listing) => {
            const rating = ratingMap.get(listing.owner_user_id);
            return {
              ...listing,
              owner_rating: rating ? { average: rating.sum / rating.count, count: rating.count } : undefined,
            };
          });
        }
      }

      // Fetch owner profiles in bulk
      if (ownerIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url, id_verified")
          .in("id", ownerIds);

        if (profileData && profileData.length > 0) {
          const profileMap = new Map(profileData.map((p) => [p.id, p]));
          results = results.map((listing) => {
            const prof = profileMap.get(listing.owner_user_id);
            return prof
              ? { ...listing, owner_profile: { first_name: prof.first_name, last_name: prof.last_name, avatar_url: prof.avatar_url, id_verified: (prof as any).id_verified } }
              : listing;
          });
        }
      }

      // Filter by countries (client-side)
      if (filters.countries && filters.countries.length > 0) {
        results = results.filter((listing) =>
          listing.country && filters.countries!.some(
            (c) => c.toLowerCase() === listing.country!.toLowerCase()
          )
        );
      }

      // Filter by cities (client-side)
      if (filters.cities && filters.cities.length > 0) {
        results = results.filter((listing) =>
          listing.city && filters.cities!.some(
            (c) => c.toLowerCase() === listing.city!.toLowerCase()
          )
        );
      }


      // Filter by pet types (client-side since it's a nested relation)
      if (filters.petTypes && filters.petTypes.length > 0) {
        results = results.filter((listing) =>
          listing.pets.some((pet) =>
            filters.petTypes!.some((type) => pet.type.toLowerCase() === type.toLowerCase())
          )
        );
      }

      // Filter by date range (client-side)
      if (filters.startDate || filters.endDate) {
        results = results.filter((listing) =>
          listing.sit_dates.some((sitDate) => {
            if (sitDate.status !== "open") return false;
            const sitStart = new Date(sitDate.start_date);
            const sitEnd = new Date(sitDate.end_date);
            
            if (filters.startDate) {
              const filterStart = new Date(filters.startDate);
              if (sitEnd < filterStart) return false;
            }
            if (filters.endDate) {
              const filterEnd = new Date(filters.endDate);
              if (sitStart > filterEnd) return false;
            }
            return true;
          })
        );
      }

      // Filter last-minute (start_date within 14 days)
      if (filters.lastMinute) {
        const today = new Date();
        const twoWeeks = new Date();
        twoWeeks.setDate(today.getDate() + 14);
        results = results.filter((listing) =>
          listing.sit_dates.some((d) => {
            if (d.status !== "open") return false;
            const start = new Date(d.start_date);
            return start >= today && start <= twoWeeks;
          })
        );
      }

      // Filter by reasons for sit (stored as comma-separated text in description or separate field — we skip DB filter and match loosely)
      // If the DB stores why_i_sit on the listing, filter here; otherwise this filter is a no-op
      if (filters.reasonsForSit && filters.reasonsForSit.length > 0) {
        // No-op for now — reasons are on sitter profiles, not listings
      }

      // Only return listings that have open sit dates
      results = results.filter((listing) =>
        listing.sit_dates.some((sitDate) => sitDate.status === "open")
      );

      // Sort results
      if (filters.sortBy === "soonest") {
        results.sort((a, b) => {
          const aOpenDates = a.sit_dates.filter(d => d.status === "open");
          const bOpenDates = b.sit_dates.filter(d => d.status === "open");
          const aEarliest = aOpenDates.length > 0 
            ? Math.min(...aOpenDates.map(d => new Date(d.start_date).getTime()))
            : Infinity;
          const bEarliest = bOpenDates.length > 0 
            ? Math.min(...bOpenDates.map(d => new Date(d.start_date).getTime()))
            : Infinity;
          return aEarliest - bEarliest;
        });
      } else {
        // Default: newest first (by created_at)
        results.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      return results;
    },
  });
};
