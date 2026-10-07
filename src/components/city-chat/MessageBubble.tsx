import { Link } from "react-router-dom";
import { Flag } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useReport } from "@/components/reports/ReportContext";
import ReactionBar from "@/components/city-chat/ReactionBar";
import type { MessageReactionSummary } from "@/hooks/useMessageReactions";

/** The official account that posts the pinned topics. Never a profile link. */
export const TEAM_USER_ID = "00000000-0000-4000-8000-00000000f00d";

export interface BubbleSender {
  id: string;
  first_name: string | null;
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
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Yesterday ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm");
};

/** One City Chat post: first name, time, text, reactions, thread link. */
const MessageBubble = ({ message, isOwn, reactions, onToggleReaction, thread, onOpenThread }: MessageBubbleProps) => {
  const { openReport } = useReport();
  const isTeam = message.sender_user_id === TEAM_USER_ID;
  const name = isTeam ? "NomadNest Team" : isOwn ? "You" : (message.sender?.first_name || "").trim() || "Nomad";
  const initial = (isTeam ? "N" : (message.sender?.first_name || "N").trim()[0] || "N").toUpperCase();
  const replies = thread?.replyCount ?? 0;

  const avatar = (
    <Avatar className="h-[38px] w-[38px]">
      <AvatarImage src={message.sender?.avatar_url || undefined} alt="" />
      <AvatarFallback className="bg-[var(--nn-chip)] text-sm font-bold text-foreground">{initial}</AvatarFallback>
    </Avatar>
  );
  const linkable = !isTeam && !isOwn;

  return (
    <article className="flex gap-3" aria-label={`${name}, ${formatStamp(message.created_at)}`}>
      {linkable ? (
        <Link to={`/sitter/${message.sender_user_id}`} className="-m-[3px] flex h-11 w-11 shrink-0 items-center justify-center" aria-label={`${name}'s profile`}>
          {avatar}
        </Link>
      ) : (
        <span className="shrink-0">{avatar}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold">{name}</span>
          <span className="text-xs text-muted-foreground">{formatStamp(message.created_at)}</span>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-normal">{message.content}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3">
          <ReactionBar reactions={reactions} onToggle={onToggleReaction} />
          {onOpenThread && (
            <button
              type="button"
              onClick={onOpenThread}
              className={cn(
                "inline-flex min-h-[44px] items-center text-sm font-semibold",
                replies ? "text-[var(--nn-accent-dark)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {replies ? `${replies} ${replies === 1 ? "reply" : "replies"}` : "Reply in thread"}
            </button>
          )}
          {!isOwn && !isTeam && (
            <button
              type="button"
              aria-label={`Report ${name}'s message`}
              onClick={() => openReport({ targetType: "city_chat_message", targetId: message.id })}
              className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <Flag className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export default MessageBubble;
