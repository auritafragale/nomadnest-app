import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
    }: {
      sitId: string;
      sitDatesId?: string;
      status: "in_progress" | "completed" | "cancelled";
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
      const statusLabel = status.replace("_", " ");
      toast.success(`Sit marked as ${statusLabel}`);
    },
    onError: (error) => {
      console.error("Error updating sit status:", error);
      toast.error("Failed to update sit status");
    },
  });
};
