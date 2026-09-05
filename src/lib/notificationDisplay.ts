/**
 * Shared presentation + routing rules for in-app notifications so the desktop
 * dropdown and the mobile list always behave identically.
 */

interface DisplayNotification {
  type: string;
  data: unknown;
}

const asData = (n: DisplayNotification) =>
  (n.data && typeof n.data === "object" ? n.data : {}) as Record<string, string>;

/** Where a notification should take the member when tapped. */
export const notificationTarget = (n: DisplayNotification): string | null => {
  const data = asData(n);
  switch (n.type) {
    case "application_status":
      // Accepted applications land straight on the applications list.
      return data.status === "accepted"
        ? "/dashboard?appTab=accepted"
        : data.url || "/dashboard";
    case "new_application":
      return "/applications";
    case "new_message":
      return data.conversation_id
        ? `/inbox?conversation=${data.conversation_id}`
        : "/inbox";
    case "sit_cancelled":
      return data.url || "/dashboard?appTab=cancelled";
    case "invite":
      return "/dashboard";
    default:
      return data.url || null;
  }
};

/** Colour treatment for the notification title. */
export const notificationTitleClass = (n: DisplayNotification): string => {
  const data = asData(n);
  if (n.type === "application_status" && data.status === "accepted") {
    return "text-green-600 dark:text-green-500";
  }
  if (n.type === "sit_cancelled") return "text-destructive";
  return "";
};
