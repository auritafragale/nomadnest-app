import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sendNotification } from "@/lib/notifications";
import { format, parseISO } from "date-fns";
import type { ListingFormData } from "./useListingForm";
import { deleteStoredImages } from "@/components/listing/ImageUpload";
import {
  LISTING_COLUMNS,
  PET_PUBLIC_COLUMNS,
  fetchListingExactLocation,
  fetchListingPrivateAddress,
  fetchOwnPetPrivateDetails,
} from "@/lib/privateColumns";

export interface DatabasePet {
  id: string;
  name: string | null;
  type: string;
  age: string | null;
  personality: string | null;
  feeding_details: string | null;
  daily_routine: string | null;
  walks_exercise: string | null;
  has_medication: boolean | null;
  medication_instructions: string | null;
  vet_info: string | null;
  photos: string[] | null;
  separation_anxiety_tolerance?: string | null;
  reactive_to_animals?: boolean | null;
}

export interface DatabaseSitDate {
  id: string;
  start_date: string;
  end_date: string;
  flexibility: string | null;
  handover_preference: string | null;
  status: string;
}

export interface ListingWithDetails {
  id: string;
  title: string;
  description: string | null;
  ideal_nomad_types: string[] | null;
  status: string;
  home_type: string | null;
  location_type: string | null;
  public_transport_accessible: boolean | null;
  city: string | null;
  country: string | null;
  area: string | null;
  address_private: string | null;
  latitude: number | null;
  longitude: number | null;
  wifi_quality: string | null;
  sleeping_arrangement: string | null;
  amenities: string[] | null;
  photos: string[] | null;
  requirements: string[] | null;
  requirements_other: string | null;
  house_rules: string[] | null;
  house_rules_other: string | null;
  home_care_tasks: string[] | null;
  home_care_tasks_other: string | null;
  communication_style: string | null;
  remote_location?: boolean | null;
  car_needed?: boolean | null;
  heavy_gardening?: boolean | null;
  wheelchair_accessible?: boolean | null;
  pets: DatabasePet[];
  sit_dates: DatabaseSitDate[];
  /** Date ranges used by a confirmed, in-progress or completed sit (read-only). */
  locked_sit_date_ids: string[];
  /** Applied + shortlisted per date range. */
  applicant_counts: Record<string, number>;
  /** The confirmed Nomad's first name per booked range. */
  booked_names: Record<string, string | null>;
}

export const useListingDetails = (listingId: string | undefined) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["listing-details", listingId],
    queryFn: async () => {
      if (!listingId) throw new Error("Listing ID required");

      const { data: listing, error: listingError } = await supabase.from("listings").select(LISTING_COLUMNS).eq("id", listingId).single();
      if (listingError) throw listingError;
      if (listing.owner_user_id !== user?.id) throw new Error("You don't have permission to edit this listing");

      // Private fields come through their RPCs. If they can't be loaded the
      // form must not open, or saving would blank them out.
      const [addressPrivate, petPrivate, exactLocation] = await Promise.all([
        fetchListingPrivateAddress(listingId),
        fetchOwnPetPrivateDetails(listingId),
        // Exact coordinates are owner-only (public pages get a fuzzed point),
        // and saving must never overwrite them with the fuzzed one.
        fetchListingExactLocation(listingId),
      ]);

      const [{ data: publicPets, error: petsError }, { data: sitDates, error: datesError }, { data: usedBySits }, { data: applicants }] =
        await Promise.all([
          supabase.from("pets").select(PET_PUBLIC_COLUMNS).eq("listing_id", listingId),
          supabase.from("sit_dates").select("*").eq("listing_id", listingId),
          // Dates in use by a sit are read-only here (the database blocks edits
          // too); they change only through Propose new dates.
          supabase.from("sits").select("sit_dates_id").eq("listing_id", listingId).in("status", ["confirmed", "in_progress", "completed"]),
          supabase.rpc("get_listing_applicants", { p_listing_id: listingId }),
        ]);
      if (petsError) throw petsError;
      if (datesError) throw datesError;

      const pets = (publicPets || []).map((pet) => ({
        ...pet,
        vet_info: petPrivate.get(pet.id)?.vet_info ?? null,
        medication_instructions: petPrivate.get(pet.id)?.medication_instructions ?? null,
      }));

      const counts: Record<string, number> = {};
      const booked: Record<string, string | null> = {};
      for (const a of (applicants ?? []) as { sit_dates_id: string; status: string; first_name: string | null }[]) {
        if (a.status === "applied" || a.status === "shortlisted") counts[a.sit_dates_id] = (counts[a.sit_dates_id] ?? 0) + 1;
        if (a.status === "accepted") booked[a.sit_dates_id] = a.first_name;
      }

      return {
        ...listing,
        locked_sit_date_ids: Array.from(new Set((usedBySits || []).map((s) => s.sit_dates_id).filter(Boolean))),
        applicant_counts: counts,
        booked_names: booked,
        address_private: addressPrivate,
        latitude: exactLocation.latitude,
        longitude: exactLocation.longitude,
        pets,
        sit_dates: sitDates || [],
      } as unknown as ListingWithDetails;
    },
    enabled: !!listingId && !!user,
  });
};

/** The listing columns both Create and Edit write. ideal_sitter_description is no longer sent, so old values stay. */
export const listingColumns = (f: ListingFormData) => ({
  title: f.title.trim(),
  description: f.description,
  ideal_nomad_types: f.ideal_nomad_types,
  home_type: f.home_type || null,
  location_type: f.location_type || null,
  public_transport_accessible: f.public_transport_accessible,
  city: f.city,
  country: f.country,
  area: f.area || null,
  address_private: f.address_private || null,
  latitude: f.latitude,
  longitude: f.longitude,
  wifi_quality: f.wifi_quality || null,
  sleeping_arrangement: f.sleeping_arrangement || null,
  amenities: f.amenities,
  photos: f.photos,
  requirements: f.requirements,
  requirements_other: f.requirements_other || null,
  house_rules: f.house_rules,
  house_rules_other: f.house_rules_other || null,
  home_care_tasks: f.home_care_tasks,
  home_care_tasks_other: f.home_care_tasks_other || null,
  communication_style: f.communication_style || null,
  remote_location: f.remote_location,
  car_needed: f.car_needed,
  heavy_gardening: f.heavy_gardening,
  wheelchair_accessible: f.wheelchair_accessible,
});

const petColumns = (pet: ListingFormData["pets"][number]) => ({
  name: pet.name.trim(),
  type: pet.type,
  age: pet.age || null,
  personality: pet.personality || null,
  feeding_details: pet.feeding_details || null,
  daily_routine: pet.daily_routine || null,
  walks_exercise: pet.walks_exercise || null,
  has_medication: pet.has_medication,
  requires_medication: pet.has_medication,
  medication_instructions: pet.has_medication ? pet.medication_instructions || null : null,
  vet_info: pet.vet_info || null,
  photos: pet.photos,
  separation_anxiety_tolerance: pet.separation_anxiety_tolerance || null,
  reactive_to_animals: pet.reactive_to_animals,
});

const dateColumns = (d: ListingFormData["sit_dates"][number]) => ({
  start_date: d.start_date,
  end_date: d.end_date,
  flexibility: d.flexibility || null,
  handover_preference: d.handover_preference || null,
});

/** Create: the listing, its pets and its dates. Removed photos are deleted afterwards. */
export const useCreateListing = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      formData,
      status,
      declarationAccepted,
      removedPhotos,
    }: {
      formData: ListingFormData;
      status: "draft" | "published";
      declarationAccepted: boolean;
      removedPhotos: string[];
    }) => {
      if (!user) throw new Error("Please sign in again.");
      const { data: listing, error } = await supabase
        .from("listings")
        .insert({
          owner_user_id: user.id,
          ...listingColumns(formData),
          status,
          // The database replaces this with its own time; it only records
          // that the declaration was ticked.
          owner_declaration_accepted_at: declarationAccepted ? new Date().toISOString() : null,
          // With coordinates, the database derives the home's time zone from
          // them. Without, fall back to the browser's.
          timezone: formData.latitude && formData.longitude ? null : Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        })
        // Only the id is needed; a bare select() would ask for address_private.
        .select("id")
        .single();
      if (error) throw error;

      const { error: petsError } = await supabase.from("pets").insert(formData.pets.map((p) => ({ listing_id: listing.id, ...petColumns(p) })));
      if (petsError) throw petsError;
      const { error: datesError } = await supabase
        .from("sit_dates")
        .insert(formData.sit_dates.map((d) => ({ listing_id: listing.id, ...dateColumns(d) })));
      if (datesError) throw datesError;

      await deleteStoredImages(removedPhotos);
      return { listingId: listing.id as string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing-allowance"] });
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
    },
  });
};

/**
 * Edit: saves the listing with the status it should have (Save changes keeps
 * the current one), pets, and dates. Removed date ranges go through
 * remove_listing_dates, which tells any applicants. Removed photos are only
 * deleted from storage after everything saved.
 */
export const useUpdateListing = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listingId,
      formData,
      status,
      originalPetIds,
      originalSitDateIds,
      declarationAccepted = false,
      removedPhotos,
    }: {
      listingId: string;
      formData: ListingFormData;
      status: string;
      originalPetIds: string[];
      originalSitDateIds: string[];
      declarationAccepted?: boolean;
      removedPhotos: string[];
    }) => {
      if (!user) throw new Error("Please sign in again.");

      const { error: listingError } = await supabase
        .from("listings")
        .update({
          ...listingColumns(formData),
          status: status as "draft" | "published" | "paused",
          // The database stamps its own time, once, and ignores later values.
          ...(declarationAccepted ? { owner_declaration_accepted_at: new Date().toISOString() } : {}),
        })
        .eq("id", listingId);
      if (listingError) throw listingError;

      // Pets: delete removed, update existing, insert new.
      const keptPetIds = formData.pets.map((p) => p.id).filter((id) => originalPetIds.includes(id));
      const petsToDelete = originalPetIds.filter((id) => !keptPetIds.includes(id));
      if (petsToDelete.length > 0) {
        const { error } = await supabase.from("pets").delete().in("id", petsToDelete);
        if (error) throw error;
      }
      for (const pet of formData.pets) {
        const { error } = originalPetIds.includes(pet.id)
          ? await supabase.from("pets").update(petColumns(pet)).eq("id", pet.id)
          : await supabase.from("pets").insert({ listing_id: listingId, ...petColumns(pet) });
        if (error) throw error;
      }

      // Dates removed in the form: through the server, so applicants are told.
      const keptDateIds = new Set(formData.sit_dates.map((d) => d.id));
      for (const id of originalSitDateIds.filter((id) => !keptDateIds.has(id))) {
        const { error } = await supabase.rpc("remove_listing_dates", { p_sit_dates_id: id });
        if (error) throw new Error(error.message);
      }

      // A sit_dates row still referenced by a live sit keeps its status;
      // only rows nothing depends on go back to "open".
      let liveReferenced = new Set<string>();
      let originalDates = new Map<string, { start_date: string; end_date: string }>();
      if (originalSitDateIds.length > 0) {
        const [{ data: refs, error: refsError }, { data: before, error: beforeError }] = await Promise.all([
          supabase.from("sits").select("sit_dates_id").in("sit_dates_id", originalSitDateIds),
          supabase.from("sit_dates").select("id, start_date, end_date").in("id", originalSitDateIds),
        ]);
        if (refsError) throw refsError;
        if (beforeError) throw beforeError;
        liveReferenced = new Set((refs || []).map((s) => s.sit_dates_id).filter(Boolean) as string[]);
        originalDates = new Map((before || []).map((d) => [d.id, { start_date: d.start_date, end_date: d.end_date }]));
      }

      for (const date of formData.sit_dates) {
        // Booked ranges are read-only here: changed only via Propose new dates.
        if (date.locked) continue;
        if (originalSitDateIds.includes(date.id)) {
          const { error } = await supabase
            .from("sit_dates")
            .update({ ...dateColumns(date), ...(liveReferenced.has(date.id) ? {} : { status: "open" as const }) })
            .eq("id", date.id);
          if (error) throw error;

          // The range moved: tell the applicants still in the running.
          const original = originalDates.get(date.id);
          if (original && (original.start_date !== date.start_date || original.end_date !== date.end_date)) {
            const { data: affected, error: affectedError } = await supabase
              .from("applications")
              .select("sitter_user_id")
              .eq("sit_dates_id", date.id)
              .in("status", ["applied", "shortlisted"]);
            if (affectedError) {
              console.error("Couldn't load applicants to tell about the new dates", affectedError.message);
            } else if (affected && affected.length > 0) {
              const datesLabel = `${format(parseISO(date.start_date), "MMM d")} – ${format(parseISO(date.end_date), "MMM d, yyyy")}`;
              await Promise.all(
                affected.map((a) =>
                  sendNotification({
                    type: "listing_dates_changed",
                    recipientUserId: a.sitter_user_id,
                    data: { listingTitle: formData.title, dates: datesLabel, url: `/listing/${listingId}`, listing_id: listingId },
                  }),
                ),
              );
            }
          }
        } else {
          const { error } = await supabase.from("sit_dates").insert({ listing_id: listingId, ...dateColumns(date) });
          if (error) throw error;
        }
      }

      await deleteStoredImages(removedPhotos);
      return { listingId, status };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["listing-details", variables.listingId] });
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing-applicants"] });
    },
  });
};

/** Removes one date range now, telling its applicants (the "Remove dates?" dialog). */
export const useRemoveListingDates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sitDatesId: string) => {
      const { data, error } = await supabase.rpc("remove_listing_dates", { p_sit_dates_id: sitDatesId });
      if (error) throw new Error(error.message);
      return (data ?? {}) as { notified?: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing-applicants"] });
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
    },
  });
};

// Convert database data to form format
export const convertToFormData = (listing: ListingWithDetails): ListingFormData => ({
  title: listing.title,
  description: listing.description || "",
  ideal_nomad_types: listing.ideal_nomad_types || [],
  pets: listing.pets.map((pet) => ({
    id: pet.id,
    name: pet.name || "",
    type: pet.type,
    age: pet.age || "",
    personality: pet.personality || "",
    feeding_details: pet.feeding_details || "",
    daily_routine: pet.daily_routine || "",
    walks_exercise: pet.walks_exercise || "",
    has_medication: pet.has_medication || false,
    medication_instructions: pet.medication_instructions || "",
    vet_info: pet.vet_info || "",
    photos: pet.photos || [],
    separation_anxiety_tolerance: pet.separation_anxiety_tolerance || "",
    reactive_to_animals: pet.reactive_to_animals || false,
  })),
  sit_dates: [...listing.sit_dates]
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((date) => ({
      id: date.id,
      start_date: date.start_date,
      end_date: date.end_date,
      flexibility: date.flexibility || "fixed",
      handover_preference: date.handover_preference || "flexible",
      locked: (listing.locked_sit_date_ids || []).includes(date.id),
    })),
  home_type: listing.home_type || "",
  location_type: listing.location_type || "",
  public_transport_accessible: listing.public_transport_accessible ?? null,
  city: listing.city || "",
  country: listing.country || "",
  locationQuery: [listing.city, listing.country].filter(Boolean).join(", ") || "",
  area: listing.area || "",
  address_private: listing.address_private || "",
  latitude: listing.latitude || null,
  longitude: listing.longitude || null,
  wifi_quality: listing.wifi_quality || "",
  sleeping_arrangement: listing.sleeping_arrangement || "",
  amenities: listing.amenities || [],
  photos: listing.photos || [],
  remote_location: listing.remote_location || false,
  car_needed: listing.car_needed || false,
  heavy_gardening: listing.heavy_gardening || false,
  wheelchair_accessible: listing.wheelchair_accessible || false,
  requirements: listing.requirements || [],
  requirements_other: listing.requirements_other || "",
  house_rules: listing.house_rules || [],
  house_rules_other: listing.house_rules_other || "",
  home_care_tasks: listing.home_care_tasks || [],
  home_care_tasks_other: listing.home_care_tasks_other || "",
  communication_style: listing.communication_style || "",
});
