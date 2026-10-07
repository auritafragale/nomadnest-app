import type { Notification } from "@/hooks/useNotifications";
import { notificationIcon, notificationTime, type NotificationTone } from "@/lib/notificationDisplay";
import { cn } from "@/lib/utils";

const TILE: Record<NotificationTone, string> = {
  accent: "bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]",
  green: "bg-[var(--nn-ok-bg)] text-brand-teal-text",
  grey: "bg-muted text-muted-foreground",
  gold: "bg-[var(--nn-tip-bg)] text-[var(--nn-tip-text)]",
  danger: "bg-[var(--nn-warn-bg)] text-[var(--nn-danger-text)]",
};

/** One notification: icon tile, title, text, time and an unread dot. */
const NotificationRow = ({
  notification,
  onOpen,
  compact = false,
}: {
  notification: Notification;
  onOpen: (n: Notification) => void;
  compact?: boolean;
}) => {
  const unread = !notification.read_at;
  const icon = notificationIcon(notification);
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      aria-label={`${unread ? "Unread. " : ""}${notification.title}`}
      className={cn(
        "flex w-full items-start gap-3 text-left transition-colors hover:bg-[var(--nn-soft)]",
        compact ? "rounded-2xl px-3 py-2.5" : "border-b border-[var(--nn-line)] px-5 py-3.5 md:px-4",
        unread && "bg-[var(--nn-soft)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold", TILE[icon.tone])}
      >
        {icon.emoji}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-2">
          <span className={cn("text-[15px] leading-snug", unread ? "font-extrabold" : "font-semibold")}>{notification.title}</span>
          <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{notificationTime(notification.created_at)}</span>
        </span>
        {notification.message && (
          <span className={cn("text-sm leading-snug text-muted-foreground", compact ? "line-clamp-1" : "line-clamp-2")}>
            {notification.message}
          </span>
        )}
      </span>
      {unread && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--nn-accent)]" aria-hidden="true" />}
    </button>
  );
};

export default NotificationRow;
