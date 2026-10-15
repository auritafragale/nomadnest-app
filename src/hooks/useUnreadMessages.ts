import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isQuietAuthError } from "@/lib/signInCheck";

/**
 * Unread message count, read-only. Realtime, the new-message sound and the
 * app icon badge live in <UnreadSync /> (mounted once), so any number of
 * components can show this count without playing the sound twice or
 * fighting over the badge.
 */
export const useUnreadMessages = () => {
  const { user, session } = useAuth();

  const { data: unreadCount = 0, isLoading } = useQuery({
    queryKey: ["unread-messages", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase.rpc("get_unread_messages_count");
      if (error) {
        if (isQuietAuthError(error)) return 0;
        throw error;
      }
      return data || 0;
    },
    enabled: !!session && !!user,
    refetchInterval: 30000,
  });

  return { unreadCount, isLoading };
};
