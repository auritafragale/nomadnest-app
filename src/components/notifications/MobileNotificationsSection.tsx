import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronDown, ChevronUp, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useNotifications,
  useUnreadNotificationsCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { notificationTarget, notificationTitleClass } from "@/lib/notificationDisplay";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useQueryClient } from "@tanstack/react-query";

interface MobileNotificationsSectionProps {
  onNavigate?: () => void;
}

export const MobileNotificationsSection = ({ onNavigate }: MobileNotificationsSectionProps) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  
  const { data: notifications = [], isLoading } = useNotifications();
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
  };

  const { pullDistance, isRefreshing, isPullable, handlers } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 50,
  });

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }

    const target = notificationTarget(notification);
    if (target) navigate(target);
    onNavigate?.();
  };


  return (
    <div className="border-t border-border pt-2">
      <Button
        variant="ghost"
        className="w-full justify-between text-muted-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center">
          <Bell className="w-4 h-4 mr-2" />
          Notifications
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-2 h-5 min-w-5 flex items-center justify-center p-0 text-xs">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {expanded && (
        <div 
          className="mt-2 space-y-1 max-h-64 overflow-y-auto relative"
          {...handlers}
        >
          {/* Pull to refresh indicator */}
          <div 
            className={cn(
              "flex items-center justify-center transition-all duration-200 overflow-hidden",
              pullDistance > 0 || isRefreshing ? "opacity-100" : "opacity-0"
            )}
            style={{ height: pullDistance > 0 ? pullDistance : isRefreshing ? 40 : 0 }}
          >
            <RefreshCw 
              className={cn(
                "h-5 w-5 text-primary transition-transform",
                isRefreshing && "animate-spin",
                isPullable && !isRefreshing && "text-primary"
              )}
              style={{ 
                transform: `rotate(${Math.min(pullDistance * 4, 360)}deg)`,
              }}
            />
            {isPullable && !isRefreshing && (
              <span className="text-xs text-primary ml-2">Release to refresh</span>
            )}
          </div>

          {unreadCount > 0 && (
            <div className="px-3 pb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs w-full"
              >
                {markAllRead.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <CheckCheck className="h-3 w-3 mr-1" />
                )}
                Mark all as read
              </Button>
            </div>
          )}

          {isLoading || isRefreshing ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Bell className="h-6 w-6 text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            notifications.slice(0, 5).map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={cn(
                  "w-full text-left p-3 rounded-md transition-colors",
                  !notification.read_at ? "bg-muted/50" : "hover:bg-muted/30"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm">{notification.title}</span>
                  {!notification.read_at && (
                    <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {notification.message}
                </p>
                <span className="text-xs text-muted-foreground mt-1 block">
                  {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                </span>
              </button>
            ))
          )}

          {notifications.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-primary"
              onClick={() => {
                navigate("/dashboard");
                onNavigate?.();
              }}
            >
              View all notifications
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
