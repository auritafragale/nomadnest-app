import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SitterWithProfile {
  id: string;
  user_id: string;
  headline: string | null;
  bio: string | null;
  why_i_sit: string | null;
  experience_level: string | null;
  experience_details: string | null;
  languages: string[];
  pet_types: string[];
  comfortable_with: string[];
  sit_style: string | null;
  home_preferences: string[];
  availability_type: string | null;
  available_from: string | null;
  available_to: string | null;
  preferred_regions: string[];
  preferred_countries: string[];
  preferred_cities: string[];
  id_verified: boolean;
  background_check: boolean;
  gallery: string[];
  age_range: string | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    city: string | null;
    country: string | null;
  } | null;
}

interface UseSittersOptions {
  searchQuery?: string;
  petTypes?: string[];
  languages?: string[];
  availableOnly?: boolean;
}

export const useSitters = (options: UseSittersOptions = {}) => {
  const [sitters, setSitters] = useState<SitterWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSitters = async () => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from("sitter_profiles")
          .select(`
            *,
            profile:user_id (first_name, last_name, avatar_url, city, country)
          `);

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        let filteredData = (data as unknown as SitterWithProfile[]) || [];

        // Client-side filtering
        if (options.searchQuery) {
          const search = options.searchQuery.toLowerCase();
          filteredData = filteredData.filter((sitter) => {
            const name = `${sitter.profile?.first_name || ""} ${sitter.profile?.last_name || ""}`.toLowerCase();
            const location = `${sitter.profile?.city || ""} ${sitter.profile?.country || ""}`.toLowerCase();
            const headline = (sitter.headline || "").toLowerCase();
            const languages = (sitter.languages || []).join(" ").toLowerCase();
            
            return (
              name.includes(search) ||
              location.includes(search) ||
              headline.includes(search) ||
              languages.includes(search)
            );
          });
        }

        if (options.petTypes && options.petTypes.length > 0) {
          filteredData = filteredData.filter((sitter) =>
            options.petTypes!.some((type) =>
              (sitter.pet_types || []).includes(type)
            )
          );
        }

        if (options.languages && options.languages.length > 0) {
          filteredData = filteredData.filter((sitter) =>
            options.languages!.some((lang) =>
              (sitter.languages || []).includes(lang)
            )
          );
        }

        if (options.availableOnly) {
          const today = new Date().toISOString().split("T")[0];
          filteredData = filteredData.filter((sitter) => {
            if (!sitter.available_from || !sitter.available_to) return true;
            return sitter.available_from <= today && sitter.available_to >= today;
          });
        }

        setSitters(filteredData);
      } catch (err: any) {
        console.error("Error fetching sitters:", err);
        setError(err.message || "Failed to load sitters");
      } finally {
        setLoading(false);
      }
    };

    fetchSitters();
  }, [options.searchQuery, options.petTypes?.join(","), options.languages?.join(","), options.availableOnly]);

  return { sitters, loading, error };
};
