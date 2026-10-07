import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CityChatRoom {
  /** Null for a locked city whose room doesn't exist yet. */
  room_id: string | null;
  city: string;
  country: string;
  city_key: string;
  has_access: boolean;
  sit_start: string | null;
  sit_end: string | null;
  nomad_count: number | null;
  unread_count: number;
  last_read_at: string | null;
  muted: boolean;
  /** Locked cards: "applied" or "invited". */
  locked_reason: "applied" | "invited" | null;
}

/**
 * The City Chats you can open (a confirmed or in-progress sit in that city
 * and country) and locked cities where you have an open application or
 * invitation. One call.
 */
export const useCityChatRooms = () => {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["my-city-chat-rooms", user?.id],
    queryFn: async (): Promise<CityChatRoom[]> => {
      const { data, error } = await supabase.rpc("get_my_city_chat_rooms");
      if (error) throw error;
      return (data ?? []) as unknown as CityChatRoom[];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });
  return { rooms: query.data ?? [], loading: query.isLoading, isError: query.isError, refetch: query.refetch };
};
