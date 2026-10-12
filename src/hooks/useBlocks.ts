import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Block a member (Batch E1). The blocker sees and removes only their own
 * blocks; the other member is never told. Blocking someone with a confirmed
 * sit that hasn't started cancels it in the database (cancel_sits_on_block).
 */
export interface BlockedMember {
  blocked_id: string;
  first_name: string;
  avatar_url: string | null;
  blocked_at: string;
}

export const useMyBlockedMembers = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-blocked-members", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_blocked_members");
      if (error) throw error;
      return (data ?? []) as BlockedMember[];
    },
    enabled: !!user,
  });
};

/** Did I block this member? (Never tells anyone whether they blocked me.) */
export const useIBlocked = (otherId: string | null | undefined) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["i-blocked", user?.id, otherId],
    queryFn: async () => {
      const { data } = await supabase
        .from("member_blocks")
        .select("blocked_id")
        .eq("blocker_id", user!.id)
        .eq("blocked_id", otherId!)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!otherId && otherId !== user.id,
  });
};

/** A sit between me and this member that blocking would affect. */
export const useSitWith = (otherId: string | null | undefined, enabled: boolean) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sit-with", user?.id, otherId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sits")
        .select("id, status, owner_user_id, sitter_user_id, snapshot_start_date, snapshot_end_date, sit_dates:sit_dates_id(start_date, end_date)")
        .in("status", ["confirmed", "in_progress"])
        .or(`and(owner_user_id.eq.${user!.id},sitter_user_id.eq.${otherId}),and(owner_user_id.eq.${otherId},sitter_user_id.eq.${user!.id})`)
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as {
        id: string;
        status: "confirmed" | "in_progress";
        owner_user_id: string;
        sitter_user_id: string;
        snapshot_start_date: string | null;
        snapshot_end_date: string | null;
        sit_dates: { start_date: string; end_date: string } | null;
      }[];
      const pick = rows.find((r) => r.status === "in_progress") ?? rows[0];
      if (!pick) return null;
      return {
        id: pick.id,
        status: pick.status,
        iAmOwner: pick.owner_user_id === user!.id,
        start: pick.sit_dates?.start_date ?? pick.snapshot_start_date,
        end: pick.sit_dates?.end_date ?? pick.snapshot_end_date,
      };
    },
    enabled: enabled && !!user && !!otherId,
  });
};

const invalidateAfterBlock = (queryClient: ReturnType<typeof useQueryClient>) => {
  for (const key of [
    "my-blocked-members", "i-blocked", "sit-with", "conversations", "sits", "sitters", "listings",
    "owner-listings", "sitter-invites", "sitter-applications", "dashboard-summary", "city-chat-messages",
  ]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
};

export const useBlockMember = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (otherId: string) => {
      const { error } = await supabase.from("member_blocks").insert({ blocker_id: user!.id, blocked_id: otherId });
      // Already blocked counts as done.
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => invalidateAfterBlock(queryClient),
  });
};

export const useUnblockMember = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (otherId: string) => {
      const { error } = await supabase.from("member_blocks").delete().eq("blocker_id", user!.id).eq("blocked_id", otherId);
      if (error) throw error;
    },
    onSuccess: () => invalidateAfterBlock(queryClient),
  });
};

/**
 * The chat to attach to a report about this member: only a conversation whose
 * two members are exactly me and them. A suggested id is used only if it is
 * one; otherwise their newest chat together, or nothing.
 */
export const findConversationWith = async (meId: string, otherId: string, suggested?: string | null) => {
  const pair = `and(owner_user_id.eq.${meId},sitter_user_id.eq.${otherId}),and(owner_user_id.eq.${otherId},sitter_user_id.eq.${meId})`;
  if (suggested) {
    const { data: match } = await supabase.from("conversations").select("id").eq("id", suggested).or(pair).maybeSingle();
    if ((match as { id: string } | null)?.id) return suggested;
  }
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .or(`and(owner_user_id.eq.${meId},sitter_user_id.eq.${otherId}),and(owner_user_id.eq.${otherId},sitter_user_id.eq.${meId})`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
};
