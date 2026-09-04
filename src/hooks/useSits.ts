import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { sendNotification } from "@/lib/notifications";

export interface Sit {
  id: string;
  listing_id: string;
  owner_user_id: string;
  sitter_user_id: string;
  sit_dates_id: string;
  status: "confirmed" | "in_progress" | "completed" | "cancelled";
  confirmed_at: string | null;
  completed_at: string | null;
  created_at: string;
  listing: {
    title: string;
    city: string | null;
    country: string | null;
    photos: string[] | null;
  } | null;
  sit_dates: {
    start_date: string;
    end_date: string;
  } | null;
  owner_profile: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
  sitter_profile: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

export const useSits = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["sits", user?.id],
    queryFn: async (): Promise<Sit[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("sits")
        .select(`
          *,
          listing:listings(title, city, country, photos),
          sit_dates:sit_dates(start_date, end_date)
        `)
        .or(`owner_user_id.eq.${user.id},sitter_user_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch profiles for owners and sitters
      const ownerIds = [...new Set(data.map((s) => s.owner_user_id))];
      const sitterIds = [...new Set(data.map((s) => s.sitter_user_id))];
      const allUserIds = [...new Set([...ownerIds, ...sitterIds])];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url")
        .in("id", allUserIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return data.map((sit) => ({
        ...sit,
        owner_profile: profileMap.get(sit.owner_user_id) || null,
        sitter_profile: profileMap.get(sit.sitter_user_id) || null,
      })) as Sit[];
    },
    enabled: !!user,
  });
};

export const useUpdateSitStatus = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      sitId,
      sitDatesId,
      status,
      reason,
    }: {
      sitId: string;
      sitDatesId?: string;
      status: "in_progress" | "completed" | "cancelled";
      /** Required when cancelling — explained to the other party. */
      reason?: string;
    }) => {
      const updateData: { 
        status: "in_progress" | "completed" | "cancelled"; 
        completed_at?: string;
      } = { status };
      
      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("sits")
        .update(updateData)
        .eq("id", sitId);

      if (error) throw error;

      // Notify the other party with the cancellation reason.
      if (status === "cancelled") {
        const { data: sit } = await supabase
          .from("sits")
          .select(
            "owner_user_id, sitter_user_id, listing:listings(title), sit_dates:sit_dates_id(start_date, end_date)",
          )
          .eq("id", sitId)
          .maybeSingle();

        if (sit && user) {
          const otherIsSitter = sit.owner_user_id === user.id;
          const otherUserId = otherIsSitter ? sit.sitter_user_id : sit.owner_user_id;
          // Deep-link straight to the cancelled item for the recipient's role.
          const url = otherIsSitter
            ? "/dashboard?appTab=cancelled#my-applications"
            : "/applications?status=cancelled";
          await supabase.from("notifications").insert({
            user_id: otherUserId,
            type: "sit_cancelled",
            title: "Sit cancelled",
            message: `${(sit.listing as { title?: string } | null)?.title || "A sit"} was cancelled. Reason: ${reason?.trim() || "no reason given"}`,
            data: { url, sit_id: sitId },
          });


          // Email + push for the other party.
          const { data: me } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", user.id)
            .maybeSingle();
          const dates = sit.sit_dates as { start_date?: string; end_date?: string } | null;
          await sendNotification({
            type: "sit_cancelled",
            recipientUserId: otherUserId,
            data: {
              listingTitle: (sit.listing as { title?: string } | null)?.title || "a sit",
              cancelledByName: [me?.first_name, me?.last_name].filter(Boolean).join(" ") || "The other party",
              reason: reason?.trim() || "",
              startDate: dates?.start_date || "",
              endDate: dates?.end_date || "",
              url,
            },
          });

        }
      }

      // Re-open sit dates when cancelled
      if (status === "cancelled" && sitDatesId) {
        const { error: sitDatesError } = await supabase
          .from("sit_dates")
          .update({ status: "open" as const })
          .eq("id", sitDatesId);

        if (sitDatesError) {
          console.error("Error re-opening sit dates:", sitDatesError);
        }
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["sits", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["sitter-applications"] });
      queryClient.invalidateQueries({ queryKey: ["owner-applications"] });
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      const statusLabel = status.replace("_", " ");
      toast.success(`Sit marked as ${statusLabel}`);
    },
    onError: (error) => {
      console.error("Error updating sit status:", error);
      toast.error("Failed to update sit status");
    },
  });
};
