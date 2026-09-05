import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITTER_PROFILE_COLUMNS } from "@/lib/profileColumns";
import { publicProfiles, type PublicProfile } from "@/lib/publicProfile";
import {
  aggregateCategoryRatings,
  SITTER_RATING_CATEGORIES,
  type CategoryAverage,
} from "@/lib/categoryRatings";

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
  latitude: number | null;
  longitude: number | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    city: string | null;
    country: string | null;
    founding_member: boolean | null;
  } | null;
  rating: { average: number; count: number };
  category_ratings: CategoryAverage[];
  review_rate: number | null;
}

interface UseSittersOptions {
  searchQuery?: string;
  petTypes?: string[];
  languages?: string[];
  experienceLevels?: string[];
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
        // Only nomads who opted into being discoverable are listed — their
        // display details also only exist in the safe public profile view when
        // they are visible, so unfiltered rows render as empty placeholders.
        const { data: sitterData, error: sitterError } = await supabase
          .from("sitter_profiles")
          .select(SITTER_PROFILE_COLUMNS as "*")
          .eq("is_visible", true);

        if (sitterError) throw sitterError;

        if (!sitterData || sitterData.length === 0) {
          setSitters([]);
          return;
        }

        const userIds = sitterData.map((s) => s.user_id);

        const [profilesResult, ratingsResult, reviewRatesResult] = await Promise.all([
          publicProfiles("id, first_name, last_name, avatar_url, city, country, founding_member")
            .in("id", userIds) as unknown as Promise<{ data: PublicProfile[] | null; error: { message: string } | null }>,
          supabase
            .from("reviews")
            .select(
              "reviewee_user_id, rating, created_at, rating_pet_care, rating_communication, rating_cleanliness, rating_reliability, rating_respect_home"
            )
            .in("reviewee_user_id", userIds),
          supabase.rpc("member_review_rates" as never, { p_user_ids: userIds } as never),
        ]);

        const reviewRateMap = new Map(
          ((reviewRatesResult.data || []) as { user_id: string; review_rate: number | null }[])
            .map((r) => [r.user_id, r.review_rate])
        );

        if (profilesResult.error) throw profilesResult.error;

        const profilesMap = new Map(
          (profilesResult.data || []).map((p) => [p.id, p])
        );

        // Compute per-sitter average ratings
        const ratingsMap = new Map<string, { average: number; count: number }>();
        const reviewsByUser = new Map<string, Record<string, unknown>[]>();
        const rawByUser = new Map<string, { rating: number; created_at: string }[]>();
        (ratingsResult.data || []).forEach((r) => {
          const raw = rawByUser.get(r.reviewee_user_id) || [];
          raw.push({ rating: r.rating, created_at: (r as { created_at: string }).created_at });
          rawByUser.set(r.reviewee_user_id, raw);
          const list = reviewsByUser.get(r.reviewee_user_id) || [];
          list.push(r as Record<string, unknown>);
          reviewsByUser.set(r.reviewee_user_id, list);
        });
        // Recent feedback describes a nomad as they are today, so it counts for more.
        rawByUser.forEach((list, userId) => {
          ratingsMap.set(userId, weightedAverage(list));
        });

        let filteredData: SitterWithProfile[] = sitterData
          .filter((sitter) => sitter.is_active !== false)
          .map((sitter) => {
            const ratingData = ratingsMap.get(sitter.user_id);
            return {
              ...sitter,
              profile: profilesMap.get(sitter.user_id) || null,
              rating: ratingData || { average: 0, count: 0 },
              review_rate: reviewRateMap.get(sitter.user_id) ?? null,
              category_ratings: aggregateCategoryRatings(
                reviewsByUser.get(sitter.user_id) || [],
                SITTER_RATING_CATEGORIES
              ),
            };
          }) as SitterWithProfile[];

        // Defensive: never render a nomad card without display details.
        filteredData = filteredData.filter((sitter) => sitter.profile !== null);

        if (options.searchQuery) {
          const search = options.searchQuery.toLowerCase();
          filteredData = filteredData.filter((sitter) => {
            const name = `${sitter.profile?.first_name || ""} ${sitter.profile?.last_name || ""}`.toLowerCase();
            const location = `${sitter.profile?.city || ""} ${sitter.profile?.country || ""}`.toLowerCase();
            const headline = (sitter.headline || "").toLowerCase();
            const languages = (sitter.languages || []).join(" ").toLowerCase();
            return name.includes(search) || location.includes(search) || headline.includes(search) || languages.includes(search);
          });
        }

        if (options.petTypes && options.petTypes.length > 0) {
          filteredData = filteredData.filter((sitter) =>
            options.petTypes!.some((type) => (sitter.pet_types || []).includes(type))
          );
        }

        if (options.languages && options.languages.length > 0) {
          filteredData = filteredData.filter((sitter) =>
            options.languages!.some((lang) => (sitter.languages || []).includes(lang))
          );
        }

        if (options.experienceLevels && options.experienceLevels.length > 0) {
          filteredData = filteredData.filter((sitter) =>
            sitter.experience_level && options.experienceLevels!.includes(sitter.experience_level)
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
  }, [
    options.searchQuery,
    options.petTypes?.join(","),
    options.languages?.join(","),
    options.experienceLevels?.join(","),
    options.availableOnly,
  ]);

  return { sitters, loading, error };
};
