import { supabase } from "@/integrations/supabase/client";

/**
 * Column lists for tables where some columns are private.
 *
 * `listings.address_private`, `pets.vet_info` and `pets.medication_instructions`
 * are not readable by `anon` / `authenticated` directly (column-level grants),
 * so `select("*")` on these tables fails. Always select these explicit lists,
 * and fetch the private fields through their RPCs, which check who's asking.
 */

// Kept as single string literals (not concatenated) so supabase-js can infer
// the row types from them.
export const LISTING_COLUMNS = "id, owner_user_id, status, title, description, city, country, area, latitude, longitude, location_type, timezone, photos, home_type, sleeping_arrangement, wifi_quality, amenities, house_rules, house_rules_other, requirements, requirements_other, home_care_tasks, home_care_tasks_other, communication_style, ideal_sitter_description, ideal_nomad_types, car_needed, heavy_gardening, remote_location, public_transport_accessible, wheelchair_accessible, created_at, updated_at";

export const PET_PUBLIC_COLUMNS = "id, listing_id, name, type, age, personality, photos, daily_routine, feeding_details, walks_exercise, has_medication, requires_medication, reactive_to_animals, separation_anxiety_tolerance, created_at, updated_at";

export interface PetPrivateDetails {
  id: string;
  vet_info: string | null;
  medication_instructions: string | null;
  /** Added with the Welcome Guide; absent before that migration. */
  behaviour_notes?: string | null;
}

/**
 * Private pet fields for a listing the caller owns, keyed by pet id.
 *
 * Uses the get_pet_private_details RPC. Until that migration is applied the
 * RPC doesn't exist, so it falls back to reading the columns directly (which
 * still works before the column revoke). If neither works it throws, so an
 * edit form never loads with these fields silently blank and wipes them on save.
 */
export const fetchOwnPetPrivateDetails = async (
  listingId: string,
): Promise<Map<string, PetPrivateDetails>> => {
  const { data, error } = await supabase.rpc("get_pet_private_details", {
    p_listing_id: listingId,
  });
  if (!error) {
    return new Map((data ?? []).map((row) => [row.id, row]));
  }

  const { data: direct, error: directError } = await supabase
    .from("pets")
    .select("id, vet_info, medication_instructions")
    .eq("listing_id", listingId);
  if (directError) throw directError;
  return new Map((direct ?? []).map((row) => [row.id, row]));
};

/**
 * Same as fetchOwnPetPrivateDetails, but never throws: for display-only use
 * (e.g. the owner viewing their own listing page), where missing private
 * fields just means they aren't shown.
 */
export const tryFetchOwnPetPrivateDetails = async (
  listingId: string,
): Promise<Map<string, PetPrivateDetails>> => {
  try {
    return await fetchOwnPetPrivateDetails(listingId);
  } catch {
    return new Map();
  }
};

/** The private address for a listing the caller owns (or is the accepted Nomad for). */
export const fetchListingPrivateAddress = async (listingId: string): Promise<string | null> => {
  const { data, error } = await supabase.rpc("get_listing_private_address", {
    p_listing_id: listingId,
  });
  if (error) throw error;
  return data ?? null;
};
