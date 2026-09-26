import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notifications";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useMembership } from "@/hooks/useMembership";
import { useVerification } from "@/hooks/useVerification";

// Must match the enforce_application_cap trigger in the database.
export const MAX_ACTIVE_APPLICANTS = 10;

export interface ApplicableSitDate {
  id: string;
  start_date: string;
  end_date: string;
  flexibility?: string | null;
}

export interface ApplicationCheckResult {
  applicableDates: ApplicableSitDate[];
  alreadyApplied: Set<string>;
  fullDates: Set<string>;
  hasExistingApplication: boolean;
  hadPastApplication: boolean;
}

/**
 * Shared gating + submission logic behind every path a Nomad can use to
 * apply for a sit (the ApplyDialog form, and the direct invite-accept
 * path on ListingDetail) — so both enforce the same membership/
 * verification access and the same already-applied/full-round checks
 * instead of drifting apart.
 */
export const useApplicationSubmission = () => {
  const { user } = useAuth();
  const { hasAccess, loading: membershipLoading } = useMembership();
  const { data: verificationData, isLoading: verificationLoading } = useVerification();

  const checkApplicability = useCallback(
    async (
      listingId: string,
      sitDates: ApplicableSitDate[],
    ): Promise<ApplicationCheckResult> => {
      if (!user || sitDates.length === 0) {
        return {
          applicableDates: [],
          alreadyApplied: new Set(),
          fullDates: new Set(),
          hasExistingApplication: sitDates.length > 0,
          hadPastApplication: false,
        };
      }

      const ids = sitDates.map((d) => d.id);

      // Only LIVE applications block re-applying. Cancelled / declined /
      // withdrawn rounds are free to apply for again (dates can be
      // re-opened or edited in place by the Pet Parent).
      const { data: mine } = await supabase
        .from("applications")
        .select("sit_dates_id, status")
        .eq("listing_id", listingId)
        .eq("sitter_user_id", user.id)
        .in("sit_dates_id", ids);

      const { data: active } = await supabase
        .from("applications")
        .select("sit_dates_id")
        .in("sit_dates_id", ids)
        .in("status", ["applied", "shortlisted"]);

      const counts = new Map<string, number>();
      (active || []).forEach((a) => {
        counts.set(a.sit_dates_id, (counts.get(a.sit_dates_id) || 0) + 1);
      });

      const live = (mine || []).filter((a) =>
        ["applied", "shortlisted", "accepted"].includes(a.status),
      );
      const alreadyApplied = new Set(live.map((a) => a.sit_dates_id));
      const hadPastApplication = (mine || []).length > live.length;
      const fullDates = new Set(
        ids.filter((id) => (counts.get(id) || 0) >= MAX_ACTIVE_APPLICANTS),
      );

      const applicableDates = sitDates.filter(
        (d) => !alreadyApplied.has(d.id) && !fullDates.has(d.id),
      );
      const hasExistingApplication = sitDates.length > 0 && applicableDates.length === 0;

      return { applicableDates, alreadyApplied, fullDates, hasExistingApplication, hadPastApplication };
    },
    [user],
  );

  const submitApplications = useCallback(
    async ({
      listingId,
      listingTitle,
      dates,
      message,
      whoApplying,
      highlights,
    }: {
      listingId: string;
      listingTitle: string;
      dates: ApplicableSitDate[];
      message: string;
      whoApplying?: string;
      highlights?: string[];
    }) => {
      if (!user || dates.length === 0) throw new Error("Nothing to submit");

      const { error } = await supabase.from("applications").insert(
        dates.map((d) => ({
          listing_id: listingId,
          sit_dates_id: d.id,
          sitter_user_id: user.id,
          message: message.trim(),
          who_applying: whoApplying?.trim() || null,
          highlights: highlights && highlights.length > 0 ? highlights : null,
          status: "applied" as const,
        })),
      );

      if (error) throw error;

      const { data: listing } = await supabase
        .from("listings")
        .select("owner_user_id")
        .eq("id", listingId)
        .single();

      const { data: sitterProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single();

      if (listing?.owner_user_id) {
        dates.forEach((d) => {
          sendNotification({
            type: "new_application",
            recipientUserId: listing.owner_user_id,
            data: {
              listingTitle,
              sitterName:
                [sitterProfile?.first_name, sitterProfile?.last_name]
                  .filter(Boolean)
                  .join(" ") || "A nomad",
              startDate: format(parseISO(d.start_date), "MMM d, yyyy"),
              endDate: format(parseISO(d.end_date), "MMM d, yyyy"),
            },
          });
        });
      }
    },
    [user],
  );

  return {
    hasAccess,
    membershipLoading,
    verificationData,
    verificationLoading,
    checkApplicability,
    submitApplications,
  };
};
