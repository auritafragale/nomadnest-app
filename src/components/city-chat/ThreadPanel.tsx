import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useCityChatThread } from "@/hooks/useCityChatThread";
import type { MessageReactionSummary } from "@/hooks/useMessageReactions";
import MessageBubble, { type BubbleMessage } from "@/components/city-chat/MessageBubble";

interface ThreadPanelProps {
  roomId: string | undefined;
  parent: BubbleMessage | null;
  onClose: () => void;
  reactionsFor: (messageId: string) => MessageReactionSummary[];
  onToggleReaction: (messageId: string, emoji: string) => void;
}

const ThreadPanel = ({
  roomId,
  parent,
  onClose,
  reactionsFor,
  onToggleReaction,
}: ThreadPanelProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { replies, loading, sending, sendReply } = useCityChatThread(roomId, parent?.id ?? null);
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
      toast({
        title: "Could not send reply",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet open={!!parent} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 pb-3 border-b border-border text-left">
          <SheetTitle className="text-base">Thread</SheetTitle>
        </SheetHeader>

        {parent && (
          <div className="p-4 border-b border-border">
            <MessageBubble
              message={parent}
              isOwn={parent.sender_user_id === user?.id}
              reactions={reactionsFor(parent.id)}
              onToggleReaction={(emoji) => onToggleReaction(parent.id, emoji)}
            />
          </div>
        )}

        <ScrollArea className="flex-1 p-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-3/4 rounded-xl" />
              <Skeleton className="h-12 w-2/3 rounded-xl" />
            </div>
          ) : replies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No replies yet — be the first to answer.
            </p>
          ) : (
            <div className="space-y-4">
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
        </ScrollArea>

        <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t border-border">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply to this thread…"
            disabled={sending}
          />
          <Button type="submit" disabled={!input.trim() || sending}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default ThreadPanel;
