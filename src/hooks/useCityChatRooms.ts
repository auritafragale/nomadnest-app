import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CityChatRoom {
  id: string;
  city: string;
  country: string;
  city_key: string;
  created_at: string;
  latitude?: number | null;
  longitude?: number | null;
  hasAccess: boolean;
}

export const useCityChatRooms = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<CityChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("city_chat_rooms")
        .select("*")
        .order("city");

      if (error || !data) {
        if (mounted) {
          setRooms([]);
          setLoading(false);
        }
        return;
      }

      let accessMap: Record<string, boolean> = {};
      if (user) {
        const results = await Promise.all(
          data.map((r) =>
            supabase
              .rpc("can_access_city_chat", { p_room_id: r.id, p_user_id: user.id })
              .then(({ data }) => [r.id, !!data] as const),
          ),
        );
        accessMap = Object.fromEntries(results);
      }

      if (mounted) {
        setRooms(data.map((r) => ({ ...r, hasAccess: !!accessMap[r.id] })));
        setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [user]);

  return { rooms, loading };
};
