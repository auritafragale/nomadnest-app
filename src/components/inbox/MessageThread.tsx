import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isYesterday } from "date-fns";
import { Send, ArrowLeft, Check, CheckCheck, Flag, Bone, Pill, Footprints, Camera, ImagePlus, Loader2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildImageMessageBody, parseImageMessage } from "@/lib/chatImage";
import type { Message, Conversation } from "@/hooks/useConversations";
import { cn } from "@/lib/utils";
import ReportDialog from "@/components/reports/ReportDialog";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { CheckinBar } from "@/components/inbox/CheckinBar";
import { useActiveSitForConversation } from "@/hooks/useActiveSitForConversation";
import { parseCheckinMessage, CHECKIN_LABELS, type CheckinKind } from "@/hooks/useSitCheckins";
import { useQueryClient } from "@tanstack/react-query";

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

const KIND_ICON: Record<CheckinKind, typeof Bone> = {
  pets_fed: Bone,
  meds_given: Pill,
  walk_completed: Footprints,
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
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoLibraryRef = useRef<HTMLInputElement>(null);
  const photoCameraRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherUser = conversation?.other_user;
  const userName = user?.user_metadata?.first_name || "User";

  const { isOtherTyping, typingUserName, sendTypingIndicator } = useTypingIndicator(
    conversation?.id || null,
    user?.id || null,
    userName
  );

  const { data: activeSit, refetch: refetchActiveSit } = useActiveSitForConversation(conversation?.id || null);

  // Current user is the sitter in this conversation?
  const isCurrentUserSitter = !!conversation && !!user && conversation.sitter_user_id === user.id;
  const isCurrentUserOwner = !!conversation && !!user && conversation.owner_user_id === user.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOtherTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    if (value.length > 0) {
      sendTypingIndicator(true);

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

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setPhotoUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/chat-photos/${Date.now()}-${Math.random().toString(36).slice(7)}.${ext}`;
      const { error } = await supabase.storage.from("listing-images").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
      setPendingPhoto(data.publicUrl);
    } catch (err: any) {
      toast.error(err.message || "Photo upload failed");
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !pendingPhoto) || isSending) return;

    onSend(
      pendingPhoto
        ? buildImageMessageBody(pendingPhoto, newMessage)
        : newMessage.trim()
    );
    setNewMessage("");
    setPendingPhoto(null);
    sendTypingIndicator(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
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
      <ScrollArea className="flex-1 p-4">
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
              const checkin = parseCheckinMessage(message.body);

              if (checkin) {
                const Icon = KIND_ICON[checkin.kind] || Bone;
                return (
                  <div key={message.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                    <div className="max-w-[80%] rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-primary">{checkin.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatMessageDate(message.created_at)}
                          </p>
                        </div>
                      </div>
                      {checkin.note && (
                        <p className="text-sm px-3 pb-2 whitespace-pre-wrap break-words text-foreground">
                          {checkin.note}
                        </p>
                      )}
                      {checkin.photo && (
                        <img
                          src={checkin.photo}
                          alt={`${checkin.label} check-in photo`}
                          loading="lazy"
                          className="w-full max-h-60 object-cover"
                        />
                      )}
                    </div>
                  </div>
                );
              }

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
        <div ref={bottomRef} />
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

      {/* Care bar / Today's care strip */}
      {activeSit && isCurrentUserSitter && (
        <CheckinBar
          sitId={activeSit.sitId}
          ownerUserId={activeSit.ownerUserId}
          listingId={activeSit.listingId}
          requiresMeds={activeSit.requiresMeds}
          todayKinds={activeSit.todayKinds}
          onPosted={() => {
            refetchActiveSit();
            queryClient.invalidateQueries({ queryKey: ["messages"] });
          }}
        />
      )}
      {activeSit && isCurrentUserOwner && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 overflow-x-auto">
          <span className="text-xs text-muted-foreground whitespace-nowrap mr-1">
            Today:
          </span>
          {(activeSit.requiresMeds
            ? ["pets_fed", "walk_completed", "meds_given"]
            : ["pets_fed", "walk_completed"]
          ).map((k) => {
            const done = activeSit.todayKinds.includes(k as CheckinKind);
            const Icon = KIND_ICON[k as CheckinKind] || Bone;
            return (
              <span
                key={k}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border",
                  done
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-background text-muted-foreground border-border",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {CHECKIN_LABELS[k as CheckinKind]}
                {done && <Check className="w-3 h-3" />}
              </span>
            );
          })}
          <Link
            to={`/sits/${activeSit.sitId}`}
            className="text-xs text-primary whitespace-nowrap hover:underline ml-auto"
          >
            Care log
          </Link>
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
