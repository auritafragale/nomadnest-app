import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ListingFilters {
  search?: string;
  petTypes?: string[];
  startDate?: string;
  endDate?: string;
  countries?: string[];
  cities?: string[];
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
          status,
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
        query = query.or(`title.ilike.${searchTerm},city.ilike.${searchTerm},country.ilike.${searchTerm},area.ilike.${searchTerm}`);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      let results = (data || []) as ListingWithDetails[];

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

      // Only return listings that have open sit dates
      results = results.filter((listing) =>
        listing.sit_dates.some((sitDate) => sitDate.status === "open")
      );

      return results;
    },
  });
};
