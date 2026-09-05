import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { publicProfiles, type PublicProfile } from "@/lib/publicProfile";
import {
  aggregateCategoryRatings,
  OWNER_RATING_CATEGORIES,
  type CategoryAverage,
} from "@/lib/categoryRatings";

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
  /** Sit-detail filters */
  noMedication?: boolean;
  aloneFourToEight?: boolean;
  notReactive?: boolean;
  noCarNeeded?: boolean;
  noPlantCare?: boolean;
  remoteOk?: boolean;
  noPets?: boolean;
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
    has_medication?: boolean | null;
    separation_anxiety_tolerance?: string | null;
    reactive_to_animals?: boolean | null;
  }[];
  remote_location?: boolean | null;
  car_needed?: boolean | null;
  heavy_gardening?: boolean | null;
  sit_dates: {
    id: string;
    start_date: string;
    end_date: string;
    status: string;
    is_urgent?: boolean | null;
  }[];
  owner_rating?: { average: number; count: number };
  owner_category_ratings?: CategoryAverage[];
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
          remote_location,
          car_needed,
          heavy_gardening,
          pets (
            id,
            name,
            type,
            has_medication,
            separation_anxiety_tolerance,
            reactive_to_animals
          ),
          sit_dates (
            id,
            start_date,
            end_date,
            status,
            is_urgent
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
          .select(
            "reviewee_user_id, rating, rating_communication, rating_home_accuracy, rating_pet_preparedness, rating_hospitality, rating_clear_expectations"
          )
          .in("reviewee_user_id", ownerIds);

        if (reviewData && reviewData.length > 0) {
          const ratingMap = new Map<string, { sum: number; count: number }>();
          const reviewsByOwner = new Map<string, Record<string, unknown>[]>();
          reviewData.forEach((r) => {
            const existing = ratingMap.get(r.reviewee_user_id) || { sum: 0, count: 0 };
            ratingMap.set(r.reviewee_user_id, { sum: existing.sum + r.rating, count: existing.count + 1 });
            const list = reviewsByOwner.get(r.reviewee_user_id) || [];
            list.push(r as Record<string, unknown>);
            reviewsByOwner.set(r.reviewee_user_id, list);
          });
          results = results.map((listing) => {
            const rating = ratingMap.get(listing.owner_user_id);
            return {
              ...listing,
              owner_rating: rating ? { average: rating.sum / rating.count, count: rating.count } : undefined,
              owner_category_ratings: aggregateCategoryRatings(
                reviewsByOwner.get(listing.owner_user_id) || [],
                OWNER_RATING_CATEGORIES
              ),
            };
          });
        }
      }

      // Fetch owner profiles in bulk
      if (ownerIds.length > 0) {
        const { data: profileData } = await publicProfiles("id, first_name, last_name, avatar_url, id_verified")
          .in("id", ownerIds) as { data: PublicProfile[] | null };

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

      // Sit-detail filters (client-side)
      if (filters.noPets) {
        results = results.filter((l) => l.pets.length === 0 && l.heavy_gardening === true);
      }
      if (filters.noMedication) {
        results = results.filter((l) => l.pets.every((p) => !p.has_medication));
      }
      if (filters.aloneFourToEight) {
        results = results.filter((l) =>
          l.pets.length === 0 || l.pets.every((p) => p.separation_anxiety_tolerance === "4-8")
        );
      }
      if (filters.notReactive) {
        results = results.filter((l) => l.pets.every((p) => !p.reactive_to_animals));
      }
      if (filters.noCarNeeded) {
        results = results.filter((l) => !l.car_needed);
      }
      if (filters.noPlantCare) {
        results = results.filter((l) => !l.heavy_gardening);
      }
      if (filters.remoteOk) {
        results = results.filter((l) => l.remote_location === true);
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

      // Only return listings that have open sit dates that haven't already passed
      const todayIso = new Date().toISOString().slice(0, 10);
      results = results.filter((listing) =>
        listing.sit_dates.some((sitDate) => sitDate.status === "open" && sitDate.end_date >= todayIso)
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
