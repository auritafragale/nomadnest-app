import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import NotificationRow from "@/components/notifications/NotificationRow";
import { NN_PAGE, PageHeader, RoleTheme, nnButton } from "@/components/nn/ui";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type Notification,
} from "@/hooks/useNotifications";
import { notificationGroup, notificationTarget } from "@/lib/notificationDisplay";
import { cn } from "@/lib/utils";

type Tab = "all" | "unread";
const GROUPS = ["Today", "This week", "Earlier"] as const;

/** All notifications (the phone bell opens this page). */
const Notifications = () => {
  const navigate = useNavigate();
  const { activeRole } = useActiveRole();
  const [tab, setTab] = useState<Tab>("all");
  const { data: notifications = [], isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const shown = tab === "unread" ? notifications.filter((n) => !n.read_at) : notifications;
  const grouped = useMemo(() => {
    const now = new Date();
    return GROUPS.map((g) => ({ title: g, items: shown.filter((n) => notificationGroup(n.created_at, now) === g) })).filter(
      (g) => g.items.length > 0,
    );
  }, [shown]);

  const open = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id);
    const target = notificationTarget(n);
    if (target) navigate(target);
  };

  return (
    <RoleTheme role={activeRole === "owner" ? "owner" : "sitter"} className="min-h-screen">
      <Navbar wide />
      <main className={cn(NN_PAGE, "flex flex-col gap-4 pb-24 pt-20 md:pt-24")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PageHeader title="Notifications" fallback="/dashboard" />
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={unreadCount === 0 || markAllRead.isPending}
            className={nnButton("ghost", "px-3")}
          >
            {markAllRead.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Mark all as read
          </button>
        </div>

        <div role="tablist" aria-label="Show" className="grid max-w-md grid-cols-2 rounded-full bg-muted p-1">
          {([
            ["all", "All"],
            ["unread", unreadCount ? `Unread (${unreadCount})` : "Unread"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "h-11 rounded-full text-sm font-bold",
                tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-w-3xl overflow-hidden rounded-[24px] border border-[var(--nn-border)] bg-card">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading notifications" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="font-display text-xl">Could not load your notifications</p>
              <button type="button" onClick={() => refetch()} className={nnButton("secondary")}>
                Try again
              </button>
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--nn-ok-bg)] text-xl font-bold text-brand-teal-text" aria-hidden="true">
                ✓
              </span>
              <p className="font-display text-xl">{tab === "unread" ? "You're all caught up" : "No notifications yet"}</p>
              <p className="text-sm text-muted-foreground">New notifications will show here.</p>
            </div>
          ) : (
            grouped.map((g) => (
              <section key={g.title} aria-label={g.title}>
                <h2 className="px-5 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground md:px-4">{g.title}</h2>
                {g.items.map((n) => (
                  <NotificationRow key={n.id} notification={n} onOpen={open} />
                ))}
              </section>
            ))
          )}
        </div>

        <Link to="/settings/notifications" className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-[var(--nn-accent-dark)] underline underline-offset-4">
          Choose what we tell you about
        </Link>
      </main>
    </RoleTheme>
  );
};

export default Notifications;
