/**
 * Shared presentation + routing rules for in-app notifications so the desktop
 * bell menu and the /notifications page always behave identically.
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
      // The row's own url (sitter mode, right tab) — same target as the push.
      return data.url || (data.status === "accepted" ? "/dashboard?appTab=accepted" : "/dashboard");
    case "new_application":
      return "/applications";
    case "new_message":
    case "phone_shared":
      return data.conversation_id
        ? `/inbox?conversation=${data.conversation_id}`
        : data.url || "/inbox";
    case "sit_cancelled":
      return data.url || "/dashboard?appTab=cancelled";
    case "invite":
      return data.url || "/dashboard";
    default:
      return data.url || null;
  }
};

export type NotificationTone = "accent" | "green" | "grey" | "gold" | "danger";

/** The icon (an emoji in a tinted tile) for each kind of notification. */
export const notificationIcon = (n: DisplayNotification): { emoji: string; tone: NotificationTone } => {
  const data = asData(n);
  switch (n.type) {
    case "new_message":
      return { emoji: "💬", tone: "accent" };
    case "phone_shared":
      return { emoji: "📞", tone: "accent" };
    case "application_status":
      if (data.status === "accepted") return { emoji: "✓", tone: "green" };
      if (data.status === "shortlisted") return { emoji: "⭐", tone: "gold" };
      return { emoji: "📋", tone: "grey" };
    case "new_application":
    case "application_withdrawn":
      return { emoji: "📋", tone: "accent" };
    case "invite":
      return { emoji: "✉️", tone: "accent" };
    case "sit_cancelled":
      return { emoji: "✕", tone: "danger" };
    case "sit_update_loved":
      return { emoji: "❤️", tone: "accent" };
    case "sit_checkin":
    case "sit_checkin_reminder":
    case "sit_started":
      return { emoji: "🐾", tone: "green" };
    case "city_chat_thread_reply":
      return { emoji: "🏙️", tone: "grey" };
    case "review_reminder":
      return { emoji: "📝", tone: "grey" };
    case "id_verification_status":
    case "id_verification_approved":
    case "id_verification_rejected":
      return { emoji: "🛡️", tone: "green" };
    case "guide_unlocked":
    case "guide_nudge":
    case "guide_access_missing":
    case "arrival_vault_prompt":
      return { emoji: "📖", tone: "green" };
    case "sit_story_ready":
    case "sit_story_ready_sitter":
    case "sit_story_portfolio_request":
      return { emoji: "📸", tone: "gold" };
    case "listing_dates_removed":
    case "listing_dates_changed":
    case "sit_reschedule_proposed":
    case "sit_reschedule_accepted":
    case "sit_reschedule_declined":
      return { emoji: "📅", tone: "grey" };
    default:
      return { emoji: "🔔", tone: "grey" };
  }
};

/** Today / This week / Earlier, for grouping the list. */
export const notificationGroup = (createdAt: string, now = new Date()): "Today" | "This week" | "Earlier" => {
  const d = new Date(createdAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return "Today";
  if (d.getTime() >= startOfToday - 6 * 86_400_000) return "This week";
  return "Earlier";
};

/** "10:24" today, "Wed" this week, "14 Sep" earlier. */
export const notificationTime = (createdAt: string, now = new Date()) => {
  const d = new Date(createdAt);
  const group = notificationGroup(createdAt, now);
  if (group === "Today") return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (group === "This week") return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
