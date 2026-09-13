import { supabase } from "@/integrations/supabase/client";

interface NotificationData {
  type:
    | "new_application"
    | "application_status"
    | "new_message"
    | "invite"
    | "review"
    | "sit_cancelled"
    | "sit_checkin"
    | "sit_reschedule_proposed"
    | "sit_reschedule_accepted"
    | "sit_reschedule_declined"
    | "arrival_vault_prompt";
  recipientUserId: string;
  data: Record<string, string>;
  /** Skip the in-app notifications row when a DB trigger already created it. */
  skipInAppNotification?: boolean;
}

export const sendNotification = async (notification: NotificationData) => {
  try {
    const appUrl = window.location.origin;
    
    const { error } = await supabase.functions.invoke("send-notification-email", {
      body: {
        ...notification,
        data: {
          ...notification.data,
          appUrl,
        },
      },
    });

    if (error) {
      console.error("Error sending notification:", error);
    } else {
      console.log("Notification sent successfully:", notification.type);
    }
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
};
