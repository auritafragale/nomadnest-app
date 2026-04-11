import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle } from "lucide-react";
import type { Conversation } from "@/hooks/useConversations";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
}

export const ConversationList = ({
  conversations,
  selectedId,
  onSelect,
  isLoading,
}: ConversationListProps) => {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-medium text-foreground">No conversations yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Start a conversation by contacting a Nomad or Pet Parent
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {conversations.map((conversation) => {
          const otherUser = conversation.other_user;
          const initials = otherUser
            ? `${otherUser.first_name?.[0] || ""}${otherUser.last_name?.[0] || ""}`
            : "?";

          return (
            <button
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={cn(
                "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors",
                "hover:bg-accent",
                selectedId === conversation.id && "bg-accent"
              )}
            >
              <Avatar className="h-12 w-12">
                <AvatarImage src={otherUser?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {initials.toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground truncate">
                    {otherUser?.first_name} {otherUser?.last_name}
                  </span>
                  {conversation.last_message && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(conversation.last_message.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>

                {conversation.listing && (
                  <p className="text-xs text-muted-foreground truncate">
                    Re: {conversation.listing.title}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 mt-1">
                  <p className="text-sm text-muted-foreground truncate">
                    {conversation.last_message?.body || "No messages yet"}
                  </p>
                  {conversation.unread_count > 0 && (
                    <Badge variant="default" className="h-5 min-w-5 flex items-center justify-center">
                      {conversation.unread_count}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
};
