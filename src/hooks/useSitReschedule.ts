import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { sendNotification } from "@/lib/notifications";

export interface SitRescheduleRequest {
  id: string;
  sit_id: string;
  proposed_start_date: string;
  proposed_end_date: string;
  requested_by: string;
  note: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  responded_at: string | null;
}

/**
 * The current pending reschedule request for a sit, if any — so both the
 * owner and the sitter know whether one is already in flight. Only one
 * pending request can exist per sit (enforced by a partial unique index on
 * the table), so this is always at most one row.
 */
export const useSitRescheduleRequest = (sitId: string | undefined, enabled = true) => {
  return useQuery({
    queryKey: ["sit-reschedule-request", sitId],
    queryFn: async (): Promise<SitRescheduleRequest | null> => {
      if (!sitId) return null;
      const { data, error } = await supabase
        .from("sit_reschedule_requests")
        .select("*")
        .eq("sit_id", sitId)
        .eq("status", "pending")
        .maybeSingle();

      if (error) throw error;
      return data as SitRescheduleRequest | null;
    },
    enabled: enabled && !!sitId,
  });
};

export const useProposeSitReschedule = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      sitId,
      sitterUserId,
      listingTitle,
      proposedStartDate,
      proposedEndDate,
      note,
    }: {
      sitId: string;
      sitterUserId: string;
      listingTitle: string;
      proposedStartDate: string;
      proposedEndDate: string;
      note?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("sit_reschedule_requests").insert({
        sit_id: sitId,
        proposed_start_date: proposedStartDate,
        proposed_end_date: proposedEndDate,
        requested_by: user.id,
        note: note?.trim() || null,
      });

      if (error) {
        // Partial unique index: one pending request per sit at a time.
        if (error.code === "23505") {
          throw new Error("A reschedule request is already pending for this sit.");
        }
        throw error;
      }

      const { data: me } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();

      // The DB column needs the ISO (yyyy-MM-dd) form above — the
      // notification/email is a display surface, so it gets a separately
      // formatted, human-readable version instead of the raw ISO string.
      await sendNotification({
        type: "sit_reschedule_proposed",
        recipientUserId: sitterUserId,
        data: {
          listingTitle,
          ownerName: [me?.first_name, me?.last_name].filter(Boolean).join(" ") || "Your Pet Parent",
          proposedStartDate: format(parseISO(proposedStartDate), "d MMM yyyy"),
          proposedEndDate: format(parseISO(proposedEndDate), "d MMM yyyy"),
          url: "/dashboard",
        },
      });
    },
    onSuccess: (_, { sitId }) => {
      queryClient.invalidateQueries({ queryKey: ["sit-reschedule-request", sitId] });
      toast.success("New dates proposed", { description: "The Nomad has been notified." });
    },
    onError: (error: Error) => {
      console.error("Error proposing reschedule:", error);
      toast.error(error.message || "Failed to propose new dates");
    },
  });
};

export const useRespondToSitReschedule = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      requestId,
      sitId,
      accept,
      ownerUserId,
      listingTitle,
    }: {
      requestId: string;
      sitId: string;
      accept: boolean;
      ownerUserId: string;
      listingTitle: string;
    }) => {
      // The only way a response is ever recorded — atomically creates the new
      // sit_dates row and re-points sits.sit_dates_id to it on accept, leaving
      // the original sit_dates row untouched for historical accuracy.
      const { data, error } = await supabase.rpc("respond_to_sit_reschedule", {
        p_request_id: requestId,
        p_accept: accept,
      });

      if (error) throw error;

      const { data: me } = user
        ? await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", user.id)
            .maybeSingle()
        : { data: null };

      await sendNotification({
        type: accept ? "sit_reschedule_accepted" : "sit_reschedule_declined",
        recipientUserId: ownerUserId,
        data: {
          listingTitle,
          sitterName: [me?.first_name, me?.last_name].filter(Boolean).join(" ") || "Your Nomad",
        },
      });

      return data as { status: string; new_sit_dates_id?: string };
    },
    onSuccess: (_, { sitId, accept }) => {
      queryClient.invalidateQueries({ queryKey: ["sit-reschedule-request", sitId] });
      // The sit's own dates may have just changed (accept re-points
      // sit_dates_id) — invalidate broadly so the card re-fetches immediately.
      queryClient.invalidateQueries({ queryKey: ["sits"] });
      toast.success(accept ? "New dates accepted!" : "New dates declined");
    },
    onError: (error: Error) => {
      console.error("Error responding to reschedule:", error);
      toast.error("Failed to respond to the reschedule request");
    },
  });
};
