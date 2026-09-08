import { cn } from "@/lib/utils";

interface ThreadWatchToggleProps {
  isSubscribed: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * "Watch"/"Watching" toggle for a city-chat thread. Purely a subscription
 * toggle — replying to a thread auto-subscribes you server-side regardless
 * of this button's state (see notify_city_chat_thread_subscribers).
 */
const ThreadWatchToggle = ({ isSubscribed, onToggle, className }: ThreadWatchToggleProps) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    aria-pressed={isSubscribed}
    aria-label={isSubscribed ? "Stop watching this thread" : "Watch this thread"}
    className={cn(
      "inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-1 shrink-0 transition-colors",
      isSubscribed
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-muted",
      className,
    )}
  >
    {isSubscribed ? "🔕 Watching" : "🔔 Watch"}
  </button>
);

export default ThreadWatchToggle;
