import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isYesterday } from "date-fns";
import { Send, ArrowLeft, Camera, Check, CheckCheck, Flag, Bone, Pill, Footprints, ImagePlus, Languages, Loader2, X } from "lucide-react";
import { languageLabel } from "@/lib/dailyUpdate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildImageMessageBody, CHAT_PHOTO_BUCKET, parseImageMessage } from "@/lib/chatImage";
import { resizeImage } from "@/lib/imageResize";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { threadConversationId, type Message, type Conversation } from "@/hooks/useConversations";
import { cn } from "@/lib/utils";
import { useReport } from "@/components/reports/ReportContext";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { ChatUpdateCard } from "@/components/sit-updates/ChatUpdateCard";
import { useConversationActiveSits } from "@/hooks/useSitStories";
import { parseCheckinMessage, type CheckinKind } from "@/hooks/useSitCheckins";
import { useLinkedGuideQuestions, type LinkedGuideQuestion } from "@/hooks/useAskNest";
import { AddToGuidePrompt, GuideQuestionCard } from "@/components/inbox/GuideQuestionChat";
import { questionFromBody } from "@/lib/askNest";

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
  const { openReport } = useReport();
  const [newMessage, setNewMessage] = useState("");
  // A photo uploaded to the private chat-photos bucket, waiting to be sent.
  const [pendingPhoto, setPendingPhoto] = useState<{ path: string; preview: string } | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoLibraryRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherUser = conversation?.other_user;
  // The other member closed their account: the chat stays, read-only.
  const otherLeft = !!conversation && (!conversation.owner_user_id || !conversation.sitter_user_id);
  const userName = user?.user_metadata?.first_name || "User";

  const { isOtherTyping, typingUserName, sendTypingIndicator } = useTypingIndicator(
    conversation?.id || null,
    user?.id || null,
    userName
  );

  const { data: activeSits = [] } = useConversationActiveSits(conversation?.conversation_ids ?? []);
  // One sit for the pill: as the sitter, the sit due today (else the first
  // live one); otherwise the owner's live sit.
  const activeSit =
    activeSits.find((s) => s.role === "sitter" && s.due_today) ??
    activeSits.find((s) => s.role === "sitter") ??
    activeSits.find((s) => s.role === "owner") ??
    null;

  // Current user is the sitter in this conversation?
  const isCurrentUserSitter = !!conversation && !!user && conversation.sitter_user_id === user.id;
  const isCurrentUserOwner = !!conversation && !!user && conversation.owner_user_id === user.id;

  // Translated messages the reader switched back to the original.
  const [showingOriginal, setShowingOriginal] = useState<Set<string>>(new Set());
  const toggleOriginal = (id: string) =>
    setShowingOriginal((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Private chat photos: signed URLs for every photo message in view.
  const chatPhotoPaths = useMemo(
    () => messages.map((m) => parseImageMessage(m.body)?.path).filter((p): p is string => !!p),
    [messages],
  );
  const { data: chatPhotoUrls = {} } = useSignedUrls(CHAT_PHOTO_BUCKET, chatPhotoPaths);

  // Ask the Nest questions sent into this chat (messages.guide_question_id).
  const guideQuestionIds = useMemo(
    () => [...new Set(messages.map((m) => m.guide_question_id).filter((id): id is string => !!id))],
    [messages],
  );
  const { data: linkedQuestions = [] } = useLinkedGuideQuestions(guideQuestionIds);
  const guideQuestionById = useMemo(() => new Map(linkedQuestions.map((q) => [q.id, q])), [linkedQuestions]);

  // Owner only: the first plain reply after an unanswered (non-emergency) guide
  // question gets an "Add this to your Welcome Guide?" prompt. Its choices are
  // every question still unanswered at that point, newest first.
  const guidePromptByMessageId = useMemo(() => {
    const result = new Map<string, LinkedGuideQuestion[]>();
    if (!isCurrentUserOwner || !user) return result;
    const isPending = (q: LinkedGuideQuestion | undefined): q is LinkedGuideQuestion =>
      !!q && !q.is_emergency && !q.answered_from_guide && !q.owner_answer && !q.dismissed_at && !q.removed_at;
    const askedSoFar: LinkedGuideQuestion[] = [];
    let awaitingReply = false;
    for (const m of messages) {
      const q = m.guide_question_id ? guideQuestionById.get(m.guide_question_id) : undefined;
      if (isPending(q)) {
        if (!askedSoFar.some((a) => a.id === q.id)) askedSoFar.push(q);
        awaitingReply = true;
        continue;
      }
      const isPlainOwnerReply =
        m.sender_user_id === user.id &&
        !m.guide_question_id &&
        !parseCheckinMessage(m.body) &&
        !parseImageMessage(m.body) &&
        m.body.trim().length > 0;
      if (awaitingReply && isPlainOwnerReply) {
        result.set(m.id, [...askedSoFar].reverse());
        awaitingReply = false;
      }
    }
    return result;
  }, [messages, guideQuestionById, isCurrentUserOwner, user]);

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

    // Camera captures can arrive with an empty/generic MIME type; the input
    // already restricts selection to images, so accept those too.
    const looksLikeImage =
      file.type.startsWith("image/") || !file.type || file.type === "application/octet-stream";
    if (!looksLikeImage) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    if (!conversation) return;
    setPhotoUploading(true);
    try {
      // Private bucket, one folder per conversation: only the two members
      // (and admins, for reports) can read it, through signed URLs. The folder
      // is the real conversation the message goes to (conversation.id is only
      // the Inbox grouping key, which the storage policy rejects).
      const blob = await resizeImage(file, 1600, 0.82);
      const path = `${threadConversationId(conversation)}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from(CHAT_PHOTO_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      setPendingPhoto({ path, preview: URL.createObjectURL(blob) });
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Photo upload failed");
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !pendingPhoto) || isSending) return;

    onSend(
      pendingPhoto
        ? buildImageMessageBody(pendingPhoto.path, newMessage)
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
      <div className="flex h-full flex-col">
        {onBack && (
          <div className="shrink-0 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to messages">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <p className="text-muted-foreground">Select a conversation to view messages</p>
        </div>
      </div>
    );
  }

  const initials = otherUser
    ? `${otherUser.first_name?.[0] || ""}`
    : "?";

  const profileLink = otherUser?.id
    ? otherUserRole === "sitter"
      ? `/sitter/${otherUser.id}`
      : `/owner/${otherUser.id}`
    : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header: compact on mobile, where the thread is full screen */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:gap-3 md:p-4">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 md:hidden" aria-label="Back to messages">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {profileLink ? (
          <Link to={profileLink} className="flex min-w-0 items-center gap-2 hover:opacity-80 transition-opacity md:gap-3">
            <Avatar className="h-9 w-9 md:h-10 md:w-10">
              <AvatarImage src={otherUser?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {initials.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="truncate font-medium leading-tight text-foreground hover:text-primary transition-colors">
                {otherUser?.first_name}
              </h3>
              {conversation.listing && (
                <p className="truncate text-xs text-muted-foreground">{conversation.listing.title}</p>
              )}
            </div>
          </Link>
        ) : (
          <>
            <Avatar className="h-9 w-9 md:h-10 md:w-10">
              <AvatarImage src={otherUser?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {initials.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="truncate font-medium leading-tight text-foreground">
                {otherUser?.first_name}
              </h3>
              {conversation.listing && (
                <p className="truncate text-xs text-muted-foreground">{conversation.listing.title}</p>
              )}
            </div>
          </>
        )}
        {otherUser?.id && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label="Report user"
            onClick={() =>
              openReport({
                targetType: "user",
                targetId: otherUser.id,
                targetLabel:
                  (otherUser.first_name || "").trim() || undefined,
              })
            }
          >
            <Flag className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="min-h-0 flex-1 px-3 py-3 md:p-4">
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
              if (message.guide_question_id) {
                const linked = guideQuestionById.get(message.guide_question_id);
                return (
                  <div key={message.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                    <GuideQuestionCard
                      question={linked?.question ?? questionFromBody(message.body)}
                      isEmergency={linked?.is_emergency ?? /^Urgent from your Welcome Guide:/i.test(message.body)}
                      isOwn={isOwn}
                      time={formatMessageDate(message.created_at)}
                    />
                  </div>
                );
              }

              const checkin = parseCheckinMessage(message.body);

              if (checkin?.kind === "daily_update") {
                return (
                  <div key={message.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                    <ChatUpdateCard
                      update={checkin}
                      sitId={activeSit?.sit_id ?? null}
                      isOwn={isOwn}
                      viewerIsOwner={isCurrentUserOwner}
                      time={formatMessageDate(message.created_at)}
                      senderName={otherUser?.first_name || "your Nomad"}
                    />
                  </div>
                );
              }

              if (checkin) {
                const Icon = KIND_ICON[checkin.kind as CheckinKind] || Bone;
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

              const imageMsg = parseImageMessage(message.body);
              const imageSrc = imageMsg ? (imageMsg.path ? chatPhotoUrls[imageMsg.path] : imageMsg.url) : null;
              if (imageMsg) {
                return (
                  <div key={message.id} className={cn("flex group", isOwn ? "justify-end" : "justify-start")}>
                    {!isOwn && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center mr-1">
                        <button
                          type="button"
                          aria-label="Report message"
                          onClick={() => openReport({ targetType: "message", targetId: message.id })}
                          className="p-1 text-muted-foreground hover:text-foreground rounded"
                        >
                          <Flag className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg overflow-hidden",
                        isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      )}
                    >
                      {imageSrc ? (
                      <a href={imageSrc} target="_blank" rel="noopener noreferrer">
                        <img
                          src={imageSrc}
                          alt={imageMsg.caption || "Shared photo"}
                          loading="lazy"
                          className="w-full max-h-72 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        />
                      </a>
                      ) : (
                        <div className="flex h-40 w-56 max-w-full items-center justify-center bg-black/10">
                          <Loader2 className="h-5 w-5 animate-spin opacity-60" aria-label="Loading photo" />
                        </div>
                      )}
                      <div className="px-4 py-2">
                        {imageMsg.caption && (
                          <p className="text-sm whitespace-pre-wrap break-words">{imageMsg.caption}</p>
                        )}
                        <div
                          className={cn(
                            "flex items-center justify-end gap-1 mt-1",
                            isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}
                        >
                          <span className="text-xs">{formatMessageDate(message.created_at)}</span>
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
                  </div>
                );
              }

              const guidePrompt = guidePromptByMessageId.get(message.id);
              return (
                <div key={message.id}>
                <div
                  className={cn("flex group", isOwn ? "justify-end" : "justify-start")}
                >
                  {/* Report button for received messages */}
                  {!isOwn && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center mr-1">
                      <button
                        type="button"
                        aria-label="Report message"
                        onClick={() => openReport({ targetType: "message", targetId: message.id })}
                        className="p-1 text-muted-foreground hover:text-foreground rounded"
                      >
                        <Flag className="h-3 w-3" />
                      </button>
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
                    {(() => {
                      // The recipient reads the translation (their language); the
                      // sender always sees what they wrote.
                      const translated = !isOwn && !!message.translated_body;
                      const original = !translated || showingOriginal.has(message.id);
                      return (
                        <>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {original ? message.body : message.translated_body}
                          </p>
                          {translated && (
                            <button
                              type="button"
                              onClick={() => toggleOriginal(message.id)}
                              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium opacity-75 hover:underline hover:opacity-100"
                            >
                              <Languages className="h-3 w-3" aria-hidden="true" />
                              {original ? `See in ${languageLabel(message.translated_lang) ?? "your language"}` : "See original"}
                            </button>
                          )}
                        </>
                      );
                    })()}
                    <div
                      className={cn(
                        "flex items-center justify-end gap-1 mt-1",
                        isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
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
                {guidePrompt && (
                  <AddToGuidePrompt messageId={message.id} replyText={message.body} candidates={guidePrompt} />
                )}
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

      {/* Today's update: one pill for the most relevant live sit between the
          two of you (the Inbox merges a pair's chats). */}
      {activeSit && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Link
            to={`/sits/${activeSit.sit_id}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              activeSit.sent_today
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : activeSit.role === "sitter" && activeSit.due_today
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {activeSit.sent_today ? <Check className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
            {activeSit.role === "sitter"
              ? activeSit.sent_today
                ? "Today's update sent"
                : activeSit.due_today
                  ? "Send today's update"
                  : "No update due today"
              : activeSit.sent_today
                ? "Today's update: sent"
                : activeSit.due_today
                  ? "Today's update: not yet"
                  : "No update due today"}
          </Link>
          <Link to={`/sits/${activeSit.sit_id}`} className="ml-auto whitespace-nowrap text-xs text-primary hover:underline">
            See updates
          </Link>
        </div>
      )}

      {/* Input */}
      {otherLeft ? (
        <p className="border-t border-border p-4 text-center text-sm text-muted-foreground">
          This member has left NomadNest. You can still read your conversation.
        </p>
      ) : (
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-border bg-background px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:p-4"
      >
        {pendingPhoto && (
          <div className="flex items-center gap-2 mb-2">
            <div className="relative">
              <img
                src={pendingPhoto.preview}
                alt="Photo to send"
                className="h-16 w-16 rounded-lg object-cover border border-border"
              />
              <button
                type="button"
                onClick={() => setPendingPhoto(null)}
                className="absolute -top-2 -right-2 p-0.5 bg-background border border-border rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Add a caption or just send the photo</p>
          </div>
        )}
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={isSending || photoUploading}
                aria-label="Add a photo"
              >
                {photoUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  photoLibraryRef.current?.click();
                }}
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                Upload from Library
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={photoLibraryRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoFile}
            className="hidden"
          />
          <Input
            value={newMessage}
            onChange={handleInputChange}
            placeholder={pendingPhoto ? "Add a caption..." : "Type a message..."}
            disabled={isSending}
            className="flex-1"
          />
          <Button type="submit" disabled={(!newMessage.trim() && !pendingPhoto) || isSending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
      )}
    </div>
  );
};
