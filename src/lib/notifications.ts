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
    | "arrival_vault_prompt"
    | "application_withdrawn"
    | "listing_dates_changed";
  recipientUserId: string;
  data: Record<string, string>;
  /** Skip the in-app notifications row when a DB trigger already created it. */
  skipInAppNotification?: boolean;
}

/**
 * Creates the in-app notification (unless skipped) and sends the email via
 * send-notification-email; the push follows from the in-app row. Never
 * throws — returns false if the call failed, so callers can tell the user.
 */
export const sendNotification = async (notification: NotificationData): Promise<boolean> => {
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
      return false;
    }
    console.log("Notification sent successfully:", notification.type);
    return true;
  } catch (error) {
    console.error("Failed to send notification:", error);
    return false;
  }
};
