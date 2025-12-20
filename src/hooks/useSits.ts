import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
