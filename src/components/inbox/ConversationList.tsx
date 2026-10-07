import { useState } from "react";
import { Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip, nnButton } from "@/components/nn/ui";
import { conversationStatus, type Conversation } from "@/hooks/useConversations";
import { messagePreviewText } from "@/lib/chatImage";
import { cn } from "@/lib/utils";

/** "10:24" today, "Yesterday", "Mon" this week, then "12 Sep". */
export const chatTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff <= 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export const ChatAvatar = ({ name, url, size = "md" }: { name: string; url?: string | null; size?: "sm" | "md" | "lg" }) => (
  <Avatar className={cn("shrink-0", size === "lg" ? "h-[52px] w-[52px]" : size === "md" ? "h-10 w-10" : "h-8 w-8")}>
    <AvatarImage src={url || undefined} alt="" />
    <AvatarFallback className="bg-[var(--nn-chip)] font-bold text-foreground">{(name.trim()[0] || "?").toUpperCase()}</AvatarFallback>
  </Avatar>
);

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export const ConversationList = ({ conversations, selectedId, onSelect, isLoading, isError, onRetry }: ConversationListProps) => {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? conversations.filter(
        (c) =>
          (c.other_user?.first_name ?? "").toLowerCase().includes(q) ||
          c.listing_contexts.some((l) => l.title.toLowerCase().includes(q)) ||
          (c.listing?.title ?? "").toLowerCase().includes(q),
      )
    : conversations;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pb-3 md:px-3">
        <label className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--nn-border)] bg-card px-3 text-muted-foreground focus-within:border-[var(--nn-accent)]">
          <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span className="sr-only">Search by name or listing</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or listing"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-1 px-5 md:px-3" aria-label="Loading your chats">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="h-[52px] w-[52px] rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="font-display text-xl">Could not load your chats</p>
            <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
            <button type="button" onClick={onRetry} className={nnButton("secondary")}>
              Try again
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <p className="font-display text-xl">No chats yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              When you apply for a sit, invite a Nomad or message a member, your chat will show here.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">No chats match “{query}”.</p>
        ) : (
          <ul>
            {shown.map((c) => {
              const name = c.other_user?.first_name || "Member";
              const unread = c.unread_count > 0;
              const chip = conversationStatus(c.context);
              const selected = selectedId === c.id || c.conversation_ids.includes(selectedId || "");
              const listingLine = c.listing?.title ?? (c.member_left ? "" : "Direct chat");
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={selected ? "true" : undefined}
                    aria-label={`${name}${listingLine ? `, ${listingLine}` : ""}${unread ? `, ${c.unread_count} unread` : ""}`}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-[var(--nn-line)] px-5 py-3 text-left transition-colors hover:bg-[var(--nn-soft)] md:rounded-2xl md:border-b-0 md:px-3",
                      unread && "bg-[var(--nn-soft)]",
                      selected && "bg-[var(--nn-tint)] md:bg-[var(--nn-tint)]",
                    )}
                  >
                    <ChatAvatar name={name} url={c.other_user?.avatar_url} size="lg" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-base", unread ? "font-extrabold" : "font-bold")}>{name}</span>
                        {c.last_message && (
                          <span className="shrink-0 text-xs text-muted-foreground">{chatTime(c.last_message.created_at)}</span>
                        )}
                      </span>
                      {(listingLine || chip) && (
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] text-muted-foreground">{listingLine}</span>
                          {chip && (
                            <span className="shrink-0 scale-90 origin-left">
                              <StatusChip tone={chip === "Confirmed" ? "green" : "grey"}>{chip}</StatusChip>
                            </span>
                          )}
                        </span>
                      )}
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-sm", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                          {c.last_message?.body ? messagePreviewText(c.last_message.body) : "No messages yet"}
                        </span>
                        {unread && (
                          <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--nn-accent)] px-1.5 text-xs font-bold text-primary-foreground">
                            {c.unread_count}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
