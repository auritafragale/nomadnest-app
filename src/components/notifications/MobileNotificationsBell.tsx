import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useUnreadNotificationsCount } from "@/hooks/useNotifications";

/** Phone bell: opens the Notifications page. */
export const MobileNotificationsBell = () => {
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();
  return (
    <Link
      to="/notifications"
      className="relative flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unreadCount > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-[var(--nn-accent)]" aria-hidden="true" />}
    </Link>
  );
};
