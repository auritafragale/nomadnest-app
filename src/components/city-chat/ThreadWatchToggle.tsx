import { cn } from "@/lib/utils";

interface ThreadWatchToggleProps {
  isSubscribed: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Follow / 🔔 Following for a City Chat thread. Purely a subscription
 * toggle — replying to a thread follows it server-side regardless of this
 * button (see notify_city_chat_thread_subscribers).
 */
const ThreadWatchToggle = ({ isSubscribed, onToggle, className }: ThreadWatchToggleProps) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={isSubscribed}
    aria-label={isSubscribed ? "Following this thread. Stop following" : "Follow this thread"}
    className={cn(
      "inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border-[1.5px] px-4 text-sm font-bold transition-colors",
      isSubscribed
        ? "border-transparent bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]"
        : "border-[var(--nn-border)] bg-card text-foreground hover:bg-[var(--nn-soft)]",
      className,
    )}
  >
    {isSubscribed ? "🔔 Following" : "Follow"}
  </button>
);

export default ThreadWatchToggle;
