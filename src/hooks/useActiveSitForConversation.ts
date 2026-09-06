import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CheckinKind } from "./useSitCheckins";

export interface ActiveSitInfo {
  sitId: string;
  ownerUserId: string;
  sitterUserId: string;
  listingId: string;
  status: "confirmed" | "in_progress";
  title: string;
  /** Whether any pet on the listing requires medication. */
  requiresMeds: boolean;
  /** Today's check-in kinds (local date). */
  todayKinds: CheckinKind[];
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * For a given conversation, resolve the active (confirmed/in-progress) sit
 * between its owner and sitter, plus today's check-ins and whether meds are
 * needed. Returns null when there is no active sit for this conversation.
 */
export const useActiveSitForConversation = (conversationId: string | null) => {
  const { user } = useAuth();

  return useQuery<ActiveSitInfo | null>({
    queryKey: ["active-sit-for-conversation", conversationId, user?.id],
    queryFn: async (): Promise<ActiveSitInfo | null> => {
      if (!conversationId || !user) return null;

      const { data: convo, error } = await supabase
        .from("conversations")
        .select("id, owner_user_id, sitter_user_id, listing_id")
        .eq("id", conversationId)
        .maybeSingle();

      if (error || !convo) return null;

      // Find the active sit matching this owner/sitter pair (and listing if present).
      let sitQuery = supabase
        .from("sits")
        .select("id, owner_user_id, sitter_user_id, listing_id, status, listing:listings(id, title)")
        .eq("owner_user_id", convo.owner_user_id)
        .eq("sitter_user_id", convo.sitter_user_id)
        .in("status", ["confirmed", "in_progress"]);

      if (convo.listing_id) {
        sitQuery = sitQuery.eq("listing_id", convo.listing_id);
      }

      const { data: sits } = await sitQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();

      const sit = sits as any;
      if (!sit || !sit.id) return null;

      // Derive live "in progress" from dates so we show the bar even before the
      // nightly job flips the status.
      const { data: sitDates } = await supabase
        .from("sit_dates")
        .select("start_date, end_date")
        .eq("id", (sit as any).sit_dates_id ?? undefined)
        .maybeSingle();

      const today = new Date();
      const start = sitDates?.start_date ? new Date(sitDates.start_date + "T00:00:00") : null;
      const end = sitDates?.end_date ? new Date(sitDates.end_date + "T23:59:59") : null;
      const isLive =
        sit.status === "in_progress" ||
        (start && end && today >= start && today <= end);

      if (!isLive) return null;

      // Check whether any pet on the listing requires medication.
      const { data: pets } = await supabase
        .from("pets")
        .select("requires_medication, has_medication")
        .eq("listing_id", sit.listing_id)
        .limit(20);

      const requiresMeds = (pets ?? []).some(
        (p: any) => p.requires_medication === true || p.has_medication === true,
      );

      // Today's check-ins.
      const { data: checkins } = await supabase
        .from("sit_checkins")
        .select("kind, created_at")
        .eq("sit_id", sit.id)
        .order("created_at", { ascending: desc })
        .limit(50);

      const todayKinds = ((checkins ?? []) as { kind: CheckinKind; created_at: string }[])
        .filter((c) => isToday(c.created_at))
        .map((c) => c.kind);

      return {
        sitId: sit.id,
        ownerUserId: sit.owner_user_id,
        sitterUserId: sit.sitter_user_id,
        listingId: sit.listing_id,
        status: sit.status as "confirmed" | "in_progress",
        title: sit.listing?.title ?? "your sit",
        requiresMeds,
        todayKinds,
      };
    },
    enabled: !!conversationId && !!user,
    // Keep today's check-ins fresh while the chat is open.
    refetchInterval: 30_000,
  });
};
