import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type MessageEmailFrequency = "instant" | "daily" | "never";

export interface NotificationPreferences {
  email_new_applications: boolean;
  email_messages: boolean;
  email_sit_updates: boolean;
  email_reviews: boolean;
  email_application_status: boolean;
  email_membership: boolean;
  push_messages: boolean;
  push_applications: boolean;
  push_sits: boolean;
  push_reviews: boolean;
  push_city_chat: boolean;
  message_email_frequency: MessageEmailFrequency;
}

/** No row yet means these: everything on, message emails right away. */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  email_new_applications: true,
  email_messages: true,
  email_sit_updates: true,
  email_reviews: true,
  email_application_status: true,
  email_membership: true,
  push_messages: true,
  push_applications: true,
  push_sits: true,
  push_reviews: true,
  push_city_chat: true,
  message_email_frequency: "instant",
};

const COLUMNS = Object.keys(DEFAULT_PREFERENCES).join(", ");

export const useNotificationPreferences = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async (): Promise<NotificationPreferences> => {
      if (!user) return DEFAULT_PREFERENCES;
      const { data, error } = await supabase.from("notification_preferences").select(COLUMNS).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_PREFERENCES, ...((data ?? {}) as Partial<NotificationPreferences>) };
    },
    enabled: !!user,
  });
};

export const useUpdateNotificationPreferences = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["notification-preferences", user?.id];

  return useMutation({
    mutationFn: async (preferences: Partial<NotificationPreferences>) => {
      if (!user) throw new Error("Not authenticated");
      // The member's own row only (RLS). Upsert creates it on first change.
      const current = queryClient.getQueryData<NotificationPreferences>(key) ?? DEFAULT_PREFERENCES;
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: user.id, ...current, ...preferences }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onMutate: async (preferences) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferences>(key);
      queryClient.setQueryData<NotificationPreferences>(key, { ...(previous ?? DEFAULT_PREFERENCES), ...preferences });
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};
