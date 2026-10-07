import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useCityChatThread } from "@/hooks/useCityChatThread";
import type { MessageReactionSummary } from "@/hooks/useMessageReactions";
import MessageBubble, { type BubbleMessage } from "@/components/city-chat/MessageBubble";
import ThreadWatchToggle from "@/components/city-chat/ThreadWatchToggle";

interface ThreadPanelProps {
  roomId: string | undefined;
  parent: BubbleMessage | null;
  onClose: () => void;
  reactionsFor: (messageId: string) => MessageReactionSummary[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  isSubscribed: boolean;
  onToggleSubscription: () => void;
  /** "panel": the desktop right column; "sheet": phone and tablet. */
  variant?: "sheet" | "panel";
}

const threadTitle = (content: string) => {
  const line = content.split("\n")[0].trim();
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
};

const ThreadBody = ({
  roomId,
  parent,
  reactionsFor,
  onToggleReaction,
}: Pick<ThreadPanelProps, "roomId" | "reactionsFor" | "onToggleReaction"> & { parent: BubbleMessage }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { replies, loading, sending, sendReply } = useCityChatThread(roomId, parent.id);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || sending) return;
    setInput("");
    const ok = await sendReply(body);
    if (!ok) {
      setInput(body);
      toast({ title: "Could not send reply", description: "Please try again.", variant: "destructive" });
    }
  };

  return (
    <>
      <div className="border-b border-[var(--nn-line)] px-4 pb-3">
        <MessageBubble
          message={parent}
          isOwn={parent.sender_user_id === user?.id}
          reactions={reactionsFor(parent.id)}
          onToggleReaction={(emoji) => onToggleReaction(parent.id, emoji)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" role="log" aria-label="Replies">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-3/4 rounded-xl" />
            <Skeleton className="h-12 w-2/3 rounded-xl" />
          </div>
        ) : replies.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No replies yet. Be the first to answer.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {replies.map((r) => (
              <MessageBubble
                key={r.id}
                message={r}
                isOwn={r.sender_user_id === user?.id}
                reactions={reactionsFor(r.id)}
                onToggleReaction={(emoji) => onToggleReaction(r.id, emoji)}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-[var(--nn-border)] p-3">
        <label htmlFor="thread-reply" className="sr-only">Reply</label>
        <input
          id="thread-reply"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Reply…"
          disabled={sending}
          className="h-11 min-w-0 flex-1 rounded-full border-[1.5px] border-[var(--nn-border)] bg-card px-4 text-[15px] outline-none focus:border-[var(--nn-accent)]"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          aria-label="Send reply"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--nn-accent)] text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </>
  );
};

/** A City Chat thread: a sheet on phone and tablet, the right column on desktop. */
const ThreadPanel = ({ variant = "sheet", ...props }: ThreadPanelProps) => {
  const { parent, onClose, isSubscribed, onToggleSubscription } = props;
  const header = (TitleTag: "h2" | typeof SheetTitle) =>
    parent && (
      <div className="flex items-start justify-between gap-2 px-4 py-3">
        <TitleTag className="font-display text-xl font-normal leading-tight">{threadTitle(parent.content)}</TitleTag>
        <div className="flex shrink-0 items-center gap-1">
          <ThreadWatchToggle isSubscribed={isSubscribed} onToggle={onToggleSubscription} />
          {variant === "panel" && (
            <button type="button" onClick={onClose} aria-label="Close thread" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--nn-soft)]">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );

  if (variant === "panel") {
    if (!parent) return null;
    return (
      <aside aria-label="Thread" className="flex w-[320px] shrink-0 flex-col border-l border-[var(--nn-border)]">
        {header("h2")}
        <ThreadBody {...props} parent={parent} />
      </aside>
    );
  }

  return (
    <Sheet open={!!parent} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="flex h-[88dvh] flex-col gap-0 rounded-t-[24px] p-0 sm:mx-auto sm:max-w-xl">
        <SheetHeader className="pr-10 text-left">
          {header(SheetTitle)}
          <SheetDescription className="sr-only">Replies to this message</SheetDescription>
        </SheetHeader>
        {parent && <ThreadBody {...props} parent={parent} />}
      </SheetContent>
    </Sheet>
  );
};

export default ThreadPanel;
