import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface NotificationPreferences {
  email_new_applications: boolean;
  email_messages: boolean;
  email_sit_updates: boolean;
  email_reviews: boolean;
  email_application_status: boolean;
}

const defaultPreferences: NotificationPreferences = {
  email_new_applications: true,
  email_messages: true,
  email_sit_updates: true,
  email_reviews: true,
  email_application_status: true,
};

export const useNotificationPreferences = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      if (!user) return defaultPreferences;

      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Create default preferences if none exist
        const { data: newData, error: insertError } = await supabase
          .from("notification_preferences")
          .insert({ user_id: user.id })
          .select()
          .single();

        if (insertError) throw insertError;
        return newData as NotificationPreferences;
      }

      return data as NotificationPreferences;
    },
    enabled: !!user,
  });
};

export const useUpdateNotificationPreferences = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: Partial<NotificationPreferences>) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("notification_preferences")
        .upsert({
          user_id: user.id,
          ...preferences,
        }, { onConflict: "user_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences", user?.id] });
    },
  });
};
