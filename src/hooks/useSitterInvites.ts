import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveInviteConversation } from "@/lib/conversations";
import { useAuth } from "@/contexts/AuthContext";
import { sendNotification } from "@/lib/notifications";
import { format, parseISO } from "date-fns";

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
    last_name: string | null;
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
        .select("id, first_name, last_name, avatar_url")
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
      
      const { data, error } = await supabase
        .from("sitter_invites")
        .insert(inviteData)
        .select()
        .single();

      if (error) throw error;

      // Get owner profile for notification
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", invite.owner_user_id)
        .single();

      const ownerName =
        [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(" ") ||
        "A pet owner";
      const listingTitleSafe = listingTitle || "my home";

      // 1) The sitter's in-app notification is created by a database trigger
      //    on sitter_invites — clients cannot insert notifications directly.



      // 2) Find-or-create the single chat thread for this home + pair
      const conversationId = await resolveInviteConversation({
        listingId: invite.listing_id,
        ownerUserId: invite.owner_user_id,
        sitterUserId: invite.sitter_user_id,
      });

      // 3) Send an opening message from the owner
      if (conversationId) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_user_id: invite.owner_user_id,
          body: `Hi! I'd love to invite you to sit at my home. I've sent you a formal invitation — please check your notifications.`,
        });
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      }

      // 4) Existing push/email notification pipeline
      sendNotification({
        type: "invite",
        recipientUserId: invite.sitter_user_id,
        data: {
          ownerName,
          listingTitle: listingTitleSafe,
          startDate: startDate || "",
          endDate: endDate || "",
        },
      });


      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sitter-invites"] });
    },
  });
};
