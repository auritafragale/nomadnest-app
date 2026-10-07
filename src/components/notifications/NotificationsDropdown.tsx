import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import NotificationRow from "@/components/notifications/NotificationRow";
import {
  useNotifications,
  useUnreadNotificationsCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type Notification,
} from "@/hooks/useNotifications";
import { notificationTarget } from "@/lib/notificationDisplay";
import { cn } from "@/lib/utils";

/** Desktop and tablet bell: the latest five, Mark all as read, See all, Settings. */
export const NotificationsDropdown = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: notifications = [], isLoading } = useNotifications();
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const openOne = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id);
    const target = notificationTarget(n);
    setOpen(false);
    if (target) navigate(target);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--nn-accent)] px-1 text-xs font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] rounded-[20px] border-[var(--nn-border)] p-2" aria-label="Notifications">
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="font-display text-xl font-normal">Notifications</h2>
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={unreadCount === 0 || markAllRead.isPending}
            className="inline-flex min-h-[44px] items-center gap-1 px-2 text-sm font-semibold text-[var(--nn-accent-dark)] disabled:text-muted-foreground"
          >
            {markAllRead.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Mark all as read
          </button>
        </div>
        <div className="flex flex-col">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading notifications" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            notifications.slice(0, 5).map((n) => <NotificationRow key={n.id} notification={n} onOpen={openOne} compact />)
          )}
        </div>
        <div className={cn("mt-1 flex items-center justify-between border-t border-[var(--nn-line)] px-3 pt-1")}>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-[44px] items-center text-sm font-bold text-[var(--nn-accent-dark)]"
          >
            See all notifications
          </Link>
          <Link to="/settings" onClick={() => setOpen(false)} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-muted-foreground">
            Settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
};
