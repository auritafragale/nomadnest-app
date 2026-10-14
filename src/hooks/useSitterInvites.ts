import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveInviteConversation } from "@/lib/conversations";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO } from "date-fns";
import { blocksReinvite } from "@/lib/invites";

export interface SitterInvite {
  id: string;
  listing_id: string;
  sit_dates_id: string;
  owner_user_id: string;
  sitter_user_id: string;
  message: string | null;
  status: "pending" | "viewed" | "applied" | "declined";
  created_at: string;
  listing?: {
    id: string;
    title: string;
    city: string | null;
    country: string | null;
    photos: string[] | null;
  };
  sit_dates?: {
    start_date: string;
    end_date: string;
  };
  owner_profile?: {
    first_name: string | null;
    last_name?: string | null;
    avatar_url: string | null;
  };
}

export const useSitterInvites = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["sitter-invites", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("sitter_invites")
        .select(`
          *,
          listing:listings(id, title, city, country, photos),
          sit_dates:sit_dates(start_date, end_date)
        `)
        .eq("sitter_user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch owner profiles
      const ownerIds = [...new Set(data.map((i) => i.owner_user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, avatar_url")
        .in("id", ownerIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return data.map((invite) => ({
        ...invite,
        owner_profile: profileMap.get(invite.owner_user_id) || null,
      })) as SitterInvite[];
    },
    enabled: !!user,
  });
};

export const usePendingInvitesCount = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["sitter-invites-pending-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { count, error } = await supabase
        .from("sitter_invites")
        .select("*", { count: "exact", head: true })
        .eq("sitter_user_id", user.id)
        .eq("status", "pending");

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });
};

export const useUpdateInviteStatus = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ inviteId, status }: { inviteId: string; status: string }) => {
      const { error } = await supabase
        .from("sitter_invites")
        .update({ status })
        .eq("id", inviteId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sitter-invites", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["sitter-invites-pending-count", user?.id] });
    },
  });
};

export const useCreateInvite = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (invite: {
      listing_id: string;
      sit_dates_id: string;
      owner_user_id: string;
      sitter_user_id: string;
      message?: string;
      listingTitle?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      const { listingTitle, startDate, endDate, ...inviteData } = invite;

      // Only a live (pending, viewed) or applied invitation for this range
      // counts as "already invited"; a declined one can be sent again.
      const { data: current } = await supabase
        .from("sitter_invites")
        .select("status")
        .eq("sit_dates_id", invite.sit_dates_id)
        .eq("sitter_user_id", invite.sitter_user_id);
      if ((current ?? []).some((r) => blocksReinvite(r.status))) {
        throw new Error("You've already invited them for these dates.");
      }

      const { data, error } = await supabase
        .from("sitter_invites")
        .insert(inviteData)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") throw new Error("You've already invited them for these dates.");
        throw error;
      }


      // 1) The Nomad is told by the database (notify_sitter_on_invite_batch): the
      //    in-app row, the push and the email, even if this tab closes now.



      // 2) Find-or-create the single chat thread for this home + pair
      const conversationId = await resolveInviteConversation({
        listingId: invite.listing_id,
        ownerUserId: invite.owner_user_id,
        sitterUserId: invite.sitter_user_id,
      });

      // 3) One opening note from the owner. post_invite_note posts it
      //    without its own "New message" alert (the invitation already told
      //    the Nomad) and never twice. A failure never blocks the invite.
      if (conversationId) {
        const { error: noteError } = await supabase.rpc("post_invite_note", {
          p_conversation_id: conversationId,
          p_sitter_user_id: invite.sitter_user_id,
          p_listing_id: invite.listing_id,
        });
        if (noteError) console.error("Could not post the invitation note", noteError.code);
      }



      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sitter-invites"] });
    },
  });
};

/**
 * The invited Nomad accepts: accept_invite creates their application to that
 * Pet Parent (under the normal application rules) and marks the invitation
 * applied; the Pet Parent then gets the usual new-application notification.
 * Until the accept_invite migration is live, it reports `needsListing` so the
 * page can fall back to applying from the listing.
 */
export const useAcceptInvite = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (invite: SitterInvite): Promise<{ needsListing: boolean }> => {
      const { data, error } = await supabase.rpc("accept_invite", { p_invite_id: invite.id });
      if (error) {
        if (error.code === "PGRST202" || /accept_invite/.test(error.message)) return { needsListing: true };
        throw new Error(error.message);
      }
      // The Pet Parent is told about the new application by the database.
      return { needsListing: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sitter-invites", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["sitter-invites-pending-count", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["sitter-applications", user?.id] });
    },
  });
};
