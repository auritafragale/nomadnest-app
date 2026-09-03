import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import ReactionBar from "@/components/city-chat/ReactionBar";
import type { MessageReactionSummary } from "@/hooks/useMessageReactions";

export interface BubbleSender {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface BubbleMessage {
  id: string;
  sender_user_id: string;
  content: string;
  created_at: string;
  sender?: BubbleSender | null;
}

export interface ThreadSummary {
  replyCount: number;
  avatars: string[];
}

interface MessageBubbleProps {
  message: BubbleMessage;
  isOwn: boolean;
  reactions: MessageReactionSummary[];
  onToggleReaction: (emoji: string) => void;
  thread?: ThreadSummary;
  onOpenThread?: () => void;
}

export const formatStamp = (s: string) => {
  const d = new Date(s);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
};

const MessageBubble = ({
  message,
  isOwn,
  reactions,
  onToggleReaction,
  thread,
  onOpenThread,
}: MessageBubbleProps) => {
  const initials =
    `${message.sender?.first_name?.[0] || ""}${message.sender?.last_name?.[0] || ""}`.toUpperCase() ||
    "?";
  const name = message.sender
    ? `${message.sender.first_name || ""} ${message.sender.last_name || ""}`.trim() || "Nomad"
    : "Nomad";

  return (
    <div className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn && (
        <Link to={`/sitter/${message.sender_user_id}`} className="shrink-0">
          <Avatar className="w-8 h-8">
            <AvatarImage src={message.sender?.avatar_url || undefined} />
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Link>
      )}

      <div className={cn("max-w-[80%] flex flex-col", isOwn && "items-end")}>
        <div
          className={cn(
            "rounded-2xl overflow-hidden",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm",
          )}
        >
          <div className="px-4 py-2">
            {!isOwn && (
              <Link
                to={`/sitter/${message.sender_user_id}`}
                className="text-xs font-semibold hover:underline block"
              >
                {name}
              </Link>
            )}
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            <p
              className={cn(
                "text-[10px] mt-1",
                isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
            >
              {formatStamp(message.created_at)}
            </p>
          </div>

          {onOpenThread && (thread?.replyCount ?? 0) > 0 && (
            <button
              type="button"
              onClick={onOpenThread}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2 border-t text-xs font-medium transition-colors",
                isOwn
                  ? "border-primary-foreground/20 hover:bg-primary-foreground/10"
                  : "border-border hover:bg-foreground/5",
              )}
            >
              <span className="flex -space-x-2">
                {(thread?.avatars ?? []).slice(0, 3).map((url, i) => (
                  <Avatar key={i} className="w-5 h-5 border border-background">
                    <AvatarImage src={url} />
                    <AvatarFallback className="text-[8px]">N</AvatarFallback>
                  </Avatar>
                ))}
              </span>
              <span>
                {thread?.replyCount} {thread?.replyCount === 1 ? "reply" : "replies"}
              </span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ReactionBar
            reactions={reactions}
            onToggle={onToggleReaction}
            align={isOwn ? "end" : "start"}
          />
          {onOpenThread && (thread?.replyCount ?? 0) === 0 && (
            <button
              type="button"
              onClick={onOpenThread}
              className="mt-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Reply in thread
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
