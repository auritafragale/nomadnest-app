import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isYesterday } from "date-fns";
import { Send, ArrowLeft, Check, CheckCheck, Flag } from "lucide-react";
import type { Message, Conversation } from "@/hooks/useConversations";
import { cn } from "@/lib/utils";
import ReportDialog from "@/components/reports/ReportDialog";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";

interface MessageThreadProps {
  conversation: Conversation | null;
  messages: Message[];
  isLoading?: boolean;
  onSend: (body: string) => void;
  isSending?: boolean;
  onBack?: () => void;
  otherUserRole?: "sitter" | "owner";
}

const formatMessageDate = (dateStr: string) => {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return `Yesterday ${format(date, "h:mm a")}`;
  return format(date, "MMM d, h:mm a");
};

export const MessageThread = ({
  conversation,
  messages,
  isLoading,
  onSend,
  isSending,
  onBack,
  otherUserRole = "sitter",
}: MessageThreadProps) => {
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const otherUser = conversation?.other_user;
  const userName = user?.user_metadata?.first_name || "User";
  
  const { isOtherTyping, typingUserName, sendTypingIndicator } = useTypingIndicator(
    conversation?.id || null,
    user?.id || null,
    userName
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOtherTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);
    
    // Send typing indicator when user starts typing
    if (value.length > 0) {
      sendTypingIndicator(true);
      
      // Clear previous timeout and set a new one to stop typing after 2 seconds of no input
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingIndicator(false);
      }, 2000);
    } else {
      sendTypingIndicator(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && !isSending) {
      onSend(newMessage.trim());
      setNewMessage("");
      sendTypingIndicator(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <p className="text-muted-foreground">Select a conversation to view messages</p>
      </div>
    );
  }

  const initials = otherUser
    ? `${otherUser.first_name?.[0] || ""}${otherUser.last_name?.[0] || ""}`
    : "?";

  const profileLink = otherUser?.id
    ? otherUserRole === "sitter"
      ? `/sitter/${otherUser.id}`
      : `/owner/${otherUser.id}`
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {profileLink ? (
          <Link to={profileLink} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Avatar className="h-10 w-10">
              <AvatarImage src={otherUser?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {initials.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-medium text-foreground hover:text-primary transition-colors">
                {otherUser?.first_name} {otherUser?.last_name}
              </h3>
              {conversation.listing && (
                <p className="text-xs text-muted-foreground">
                  Re: {conversation.listing.title}
                </p>
              )}
            </div>
          </Link>
        ) : (
          <>
            <Avatar className="h-10 w-10">
              <AvatarImage src={otherUser?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {initials.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-medium text-foreground">
                {otherUser?.first_name} {otherUser?.last_name}
              </h3>
              {conversation.listing && (
                <p className="text-xs text-muted-foreground">
                  Re: {conversation.listing.title}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
                <Skeleton className="h-16 w-48 rounded-lg" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isOwn = message.sender_user_id === user?.id;
              const isRead = !!message.read_at;
              return (
                <div
                  key={message.id}
                  className={cn("flex group", isOwn ? "justify-end" : "justify-start")}
                >
                  {/* Report button for received messages */}
                  {!isOwn && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center mr-1">
                      <ReportDialog
                        targetType="message"
                        targetId={message.id}
                        trigger={
                          <button className="p-1 text-muted-foreground hover:text-foreground rounded">
                            <Flag className="h-3 w-3" />
                          </button>
                        }
                      />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-4 py-2",
                      isOwn
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
                    <div
                      className={cn(
                        "flex items-center justify-end gap-1 mt-1",
                        isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}
                    >
                      <span className="text-xs">
                        {formatMessageDate(message.created_at)}
                      </span>
                      {isOwn && (
                        isRead ? (
                          <CheckCheck className="h-3.5 w-3.5 text-primary-foreground/90" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Typing Indicator */}
      {isOtherTyping && (
        <div className="px-4 py-2 border-t border-border bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span>{typingUserName || otherUser?.first_name || "User"} is typing...</span>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={handleInputChange}
            placeholder="Type a message..."
            disabled={isSending}
            className="flex-1"
          />
          <Button type="submit" disabled={!newMessage.trim() || isSending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};
