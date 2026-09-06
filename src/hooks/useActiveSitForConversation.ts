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
export const useActiveSitForConversation = (conversationIds: string[]) => {
  const { user } = useAuth();

  return useQuery<ActiveSitInfo | null>({
    queryKey: ["active-sit-for-conversation", conversationIds, user?.id],
    queryFn: async (): Promise<ActiveSitInfo | null> => {
      if (conversationIds.length === 0 || !user) return null;

      const { data: convo, error } = await supabase
        .from("conversations")
        .select("id, owner_user_id, sitter_user_id, listing_id")
        .in("id", conversationIds);

      if (error || !convo?.length) return null;

      // A home chat has one canonical identity: the home plus the Pet Parent /
      // Nomad pair. Match the sit strictly on those, so a member who is a Pet
      // Parent elsewhere never sees another home's sit in this chat.
      const listingConversations = convo.filter((row) => row.listing_id);
      if (listingConversations.length === 0) return null;

      const sitQuery = supabase
        .from("sits")
        .select("id, owner_user_id, sitter_user_id, listing_id, status, sit_dates_id, listing:listings(id, title)")
        .in("status", ["confirmed", "in_progress"])
        .in("listing_id", listingConversations.map((row) => row.listing_id as string));


      const { data: sitRows } = await sitQuery.order("created_at", { ascending: false }).limit(10);

      const allSits = ((sitRows ?? []) as any[]).filter((sit) =>
        listingConversations.some((row) =>
          row.listing_id === sit.listing_id &&
          row.owner_user_id === sit.owner_user_id &&
          row.sitter_user_id === sit.sitter_user_id,
        ),
      );
      if (allSits.length === 0) return null;

      // Fetch sit_dates for each candidate and pick the one that is live today.
      const today = new Date();
      let liveSit: any | null = null;

      for (const candidate of allSits) {
        const { data: sitDates } = await supabase
          .from("sit_dates")
          .select("start_date, end_date")
          .eq("id", candidate.sit_dates_id ?? "")
          .maybeSingle();

        const start = sitDates?.start_date ? new Date(sitDates.start_date + "T00:00:00") : null;
        const end = sitDates?.end_date ? new Date(sitDates.end_date + "T23:59:59") : null;
        const isLive =
          candidate.status === "in_progress" ||
          (start && end && today >= start && today <= end);

        if (isLive) {
          liveSit = candidate;
          break;
        }
      }

      const sit = liveSit;
      if (!sit) return null;

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
        .order("created_at", { ascending: false })
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
    enabled: conversationIds.length > 0 && !!user,
    // Keep today's check-ins fresh while the chat is open.
    refetchInterval: 30_000,
  });
};
