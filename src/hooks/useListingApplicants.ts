import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

export type ApplicationStatus = Database["public"]["Enums"]["application_status"];

/** One application on the owner's listing (get_listing_applicants). First names only. */
export interface Applicant {
  application_id: string;
  sit_dates_id: string;
  start_date: string;
  end_date: string;
  status: ApplicationStatus;
  created_at: string;
  owner_seen: boolean;
  message: string | null;
  who_applying: string | null;
  highlights: string[] | null;
  sitter_user_id: string;
  first_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  founding_member: boolean;
  id_verified: boolean;
  pet_types: string[];
  review_count: number;
  avg_rating: number | null;
  review_rate: number | null;
  fit_total_nights: number;
  fit_free_nights: number | null;
  fit_free_from: string | null;
  fit_free_to: string | null;
  fit_pets_known: string[];
  fit_pets_missing: string[];
  fit_meds_ok: boolean | null;
  fit_same_city: boolean;
}

export interface OwnerListing {
  id: string;
  title: string;
  status: string;
  city: string | null;
  sit_dates: { id: string; start_date: string; end_date: string; status: string }[];
}

/** The signed-in Pet Parent's listings, newest first, with their date ranges. */
export const useMyListings = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-listings-for-applicants", user?.id],
    queryFn: async (): Promise<OwnerListing[]> => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, title, status, city, created_at, sit_dates (id, start_date, end_date, status)")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OwnerListing[];
    },
    enabled: !!user,
  });
};

export const useListingApplicants = (listingId: string | undefined) =>
  useQuery({
    queryKey: ["listing-applicants", listingId],
    queryFn: async (): Promise<Applicant[]> => {
      const { data, error } = await supabase.rpc("get_listing_applicants", { p_listing_id: listingId! });
      if (error) throw error;
      return (data ?? []) as unknown as Applicant[];
    },
    enabled: !!listingId,
  });

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["listing-applicants"] });
    queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
  };
};

const rpcError = (error: { message?: string } | null) => new Error(error?.message || "Something went wrong. Please try again.");

/** Star: shortlist (tells the Nomad) or un-shortlist (no notification). */
export const useToggleShortlist = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ applicationId, shortlist }: { applicationId: string; shortlist: boolean }) => {
      const { error } = await supabase.rpc(shortlist ? "shortlist_application" : "unshortlist_application", {
        p_application_id: applicationId,
      });
      if (error) throw rpcError(error);
    },
    onSettled: invalidate,
  });
};

/** accept_application: confirms, books the dates and tells everyone, in one transaction. */
export const useConfirmApplicant = () => {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const { data, error } = await supabase.rpc("accept_application", { p_application_id: applicationId });
      if (error) throw rpcError(error);
      const result = (data ?? {}) as { sit_id?: string; declined_count?: number };
      return { sitId: result.sit_id ?? null, declinedCount: result.declined_count ?? 0 };
    },
    onSettled: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["sits"] });
    },
  });
};

/** decline_application with the optional personal note (cleaned on the server). */
export const useDeclineApplicant = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ applicationId, note }: { applicationId: string; note: string }) => {
      const { error } = await supabase.rpc("decline_application", {
        p_application_id: applicationId,
        p_note: note.trim() || undefined,
      });
      if (error) throw rpcError(error);
    },
    onSettled: invalidate,
  });
};

/** Clears the "New" pill once the Pet Parent has opened an application. */
export const useMarkApplicantsSeen = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const { data, error } = await supabase.rpc("mark_applications_seen", { p_ids: ids });
      if (error) throw rpcError(error);
      return data ?? 0;
    },
    onSuccess: (_, ids) => {
      queryClient.setQueriesData<Applicant[]>({ queryKey: ["listing-applicants"] }, (rows) =>
        rows?.map((r) => (ids.includes(r.application_id) ? { ...r, owner_seen: true } : r)),
      );
    },
  });
};
