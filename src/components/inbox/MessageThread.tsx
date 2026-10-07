import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bone, CalendarDays, Camera, Check, CheckCheck, ChevronRight, Flag, Footprints, ImagePlus, Languages, Loader2, MoreHorizontal, Pill, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { languageLabel } from "@/lib/dailyUpdate";
import { buildImageMessageBody, CHAT_PHOTO_BUCKET, parseImageMessage } from "@/lib/chatImage";
import { resizeImage } from "@/lib/imageResize";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import {
  conversationStatus,
  hasLiveSit,
  threadConversationId,
  type Message,
  type Conversation,
} from "@/hooks/useConversations";
import { cn } from "@/lib/utils";
import { useReport } from "@/components/reports/ReportContext";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { ChatUpdateCard } from "@/components/sit-updates/ChatUpdateCard";
import { useConversationActiveSits } from "@/hooks/useSitStories";
import { parseCheckinMessage, type CheckinKind } from "@/hooks/useSitCheckins";
import { useLinkedGuideQuestions, type LinkedGuideQuestion } from "@/hooks/useAskNest";
import { AddToGuidePrompt, GuideQuestionCard } from "@/components/inbox/GuideQuestionChat";
import { questionFromBody } from "@/lib/askNest";
import { ChatAvatar } from "@/components/inbox/ConversationList";
import { PhoneShareAsk, PhoneShareMessage, PhoneShareSheet } from "@/components/inbox/PhoneShare";
import { usePhoneShares } from "@/hooks/usePhoneShares";
import { parsePhoneShareMessage } from "@/lib/phoneShare";
import { petList, useThreadSit } from "@/hooks/useThreadSit";
import { CONTACT_LABEL, MONEY_NOTE, NOT_CONFIRMED_NOTE, detectContactDetail, mentionsMoney } from "@/lib/chatSafety";
import { shortRange, nnButton } from "@/components/nn/ui";

interface MessageThreadProps {
  conversation: Conversation | null;
  messages: Message[];
  isLoading?: boolean;
  onSend: (body: string) => void;
  isSending?: boolean;
  onBack?: () => void;
  otherUserRole?: "sitter" | "owner";
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: diff < 7 ? "long" : undefined, day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
};

/** "Portuguese" for pt (English names, for "Translated from …"). */
const englishLanguage = (code: string | null | undefined) => {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? null;
  } catch {
    return null;
  }
};

const KIND_ICON: Record<CheckinKind, typeof Bone> = {
  pets_fed: Bone,
  meds_given: Pill,
  walk_completed: Footprints,
};

const NOTE = "self-center max-w-[92%] rounded-xl px-3 py-2 text-center text-[13px] leading-snug";

const dismissKey = (pair: string) => `nn_phone_ask_dismissed_${pair}`;
const readDismissed = (pair: string) => {
  try {
    return localStorage.getItem(dismissKey(pair)) === "1";
  } catch {
    return false;
  }
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
  const [moneyDismissed, setMoneyDismissed] = useState(false);
  const [contactDismissed, setContactDismissed] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [askDismissed, setAskDismissed] = useState(false);
  const photoLibraryRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherUser = conversation?.other_user;
  const otherName = otherUser?.first_name || "Member";
  // The other member closed their account: the chat stays, read-only.
  const otherLeft = !!conversation && (conversation.member_left || !conversation.owner_user_id || !conversation.sitter_user_id);
  const userName = user?.user_metadata?.first_name || "User";
  const context = conversation?.context;
  const liveSit = !!context && hasLiveSit(context);
  // Contact details are fine once a sit has been confirmed between you.
  const sitConfirmedOnce = !!context && (liveSit || context.sit_status === "completed");
  const status = context ? conversationStatus(context) : null;
  const sitInfo = useThreadSit(conversation);

  const { isOtherTyping, typingUserName, sendTypingIndicator } = useTypingIndicator(
    conversation?.id || null,
    user?.id || null,
    userName,
  );

  const phone = usePhoneShares(otherLeft ? null : otherUser?.id);

  useEffect(() => {
    setAskDismissed(conversation ? readDismissed(conversation.id) : false);
    setNewMessage("");
    setPendingPhoto(null);
    setMoneyDismissed(false);
    setContactDismissed(false);
  }, [conversation?.id]);

  const { data: activeSits = [] } = useConversationActiveSits(conversation?.conversation_ids ?? []);
  // One sit for the pill: as the sitter, the sit due today (else the first
  // live one); otherwise the owner's live sit.
  const activeSit =
    activeSits.find((s) => s.role === "sitter" && s.due_today) ??
    activeSits.find((s) => s.role === "sitter") ??
    activeSits.find((s) => s.role === "owner") ??
    null;

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
        !parsePhoneShareMessage(m.body) &&
        m.body.trim().length > 0;
      if (awaitingReply && isPlainOwnerReply) {
        result.set(m.id, [...askedSoFar].reverse());
        awaitingReply = false;
      }
    }
    return result;
  }, [messages, guideQuestionById, isCurrentUserOwner, user]);

  // The newest phone-share marker from each side (only that one can show a number).
  const latestShareId = useMemo(() => {
    const latest: Record<string, string> = {};
    for (const m of messages) if (parsePhoneShareMessage(m.body)) latest[m.sender_user_id] = m.id;
    return latest;
  }, [messages]);
  const iEverShared = !!user && !!latestShareId[user.id];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOtherTyping]);

  const resizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewMessage(value);
    resizeInput();
    if (value.length > 0) {
      sendTypingIndicator(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTypingIndicator(false), 2000);
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
    const looksLikeImage = file.type.startsWith("image/") || !file.type || file.type === "application/octet-stream";
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

  const send = () => {
    if ((!newMessage.trim() && !pendingPhoto) || isSending) return;
    onSend(pendingPhoto ? buildImageMessageBody(pendingPhoto.path, newMessage) : newMessage.trim());
    setNewMessage("");
    setPendingPhoto(null);
    setMoneyDismissed(false);
    setContactDismissed(false);
    sendTypingIndicator(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    requestAnimationFrame(resizeInput);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on a keyboard; Shift+Enter (and phones) add a new line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(hover: hover)").matches) {
      e.preventDefault();
      send();
    }
  };

  // The newest message from the other member, for "Report this chat".
  const lastTheirs = [...messages].reverse().find((m) => m.sender_user_id !== user?.id);
  const reportChat = () => {
    if (lastTheirs) openReport({ targetType: "message", targetId: lastTheirs.id, targetLabel: "chat" });
    else if (otherUser?.id) openReport({ targetType: "user", targetId: otherUser.id, targetLabel: otherName });
  };

  const doShare = () =>
    phone.share.mutate(undefined, {
      onSuccess: () => {
        setShareSheetOpen(false);
        toast.success(`Your number is shared with ${otherName}.`);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Please try again."),
    });
  const doStop = () =>
    phone.stop.mutate(undefined, {
      onSuccess: () => toast.success("You stopped sharing your number."),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Please try again."),
    });
  const notNow = () => {
    if (!conversation) return;
    try {
      localStorage.setItem(dismissKey(conversation.id), "1");
    } catch {
      // Private mode: it shows again next time, which is fine.
    }
    setAskDismissed(true);
    toast("No problem. You can share it later from the ⋯ menu.");
  };

  if (!conversation) {
    return (
      <div className="flex h-full flex-col">
        {onBack && (
          <div className="shrink-0 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
            <button type="button" onClick={onBack} aria-label="Back to Messages" className="flex h-11 w-11 items-center justify-center rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <p className="font-display text-xl">Choose a chat</p>
          <p className="mt-1 text-sm text-muted-foreground">Your messages will show here.</p>
        </div>
      </div>
    );
  }

  const profileLink = !otherLeft && otherUser?.id ? (otherUserRole === "sitter" ? `/sitter/${otherUser.id}` : `/owner/${otherUser.id}`) : null;
  const dates = context?.sit_start && context.sit_end ? shortRange(context.sit_start, context.sit_end) : null;
  const subLine = [
    conversation.listing?.title ?? (otherLeft ? null : "Direct chat"),
    status === "Confirmed" && dates
      ? `Confirmed ${dates}`
      : status === "Past sit"
        ? "Past sit"
        : status === "Applied"
          ? "Applied"
          : status === "Invited"
            ? "Invited"
            : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const draft = newMessage;
  const contactKind = !sitConfirmedOnce && !contactDismissed ? detectContactDetail(draft) : null;
  const moneyWarn = !moneyDismissed && mentionsMoney(draft);
  const canShare = !!phone.state?.can_share;
  const showAsk = !otherLeft && canShare && !phone.state?.i_am_sharing && !iEverShared && !askDismissed && !phone.isLoading;

  const strip = liveSit && context?.sit_id && (
    <Link
      to={`/sits/${context.sit_id}`}
      className="mx-3 mt-2.5 flex shrink-0 items-center justify-between gap-2.5 rounded-2xl bg-[var(--nn-ok-bg)] px-3 py-2.5 text-foreground lg:hidden"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-brand-teal-text" aria-hidden="true">
          <CalendarDays className="h-[18px] w-[18px]" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold">
            Your sit{sitInfo?.petNames.length ? ` with ${petList(sitInfo.petNames)}` : ""}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {dates}
            {sitInfo?.guideUnlockAt
              ? ` · details unlock ${new Date(sitInfo.guideUnlockAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: sitInfo.guideTimezone ?? undefined })}`
              : ""}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center text-sm font-bold text-brand-teal-text">
        See sit <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );

  let lastDay = "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--nn-border)] px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:gap-3 md:px-4 md:py-3">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to Messages" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--nn-soft)] md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {profileLink ? (
          <Link to={profileLink} aria-label={`${otherName}'s profile`} className="flex h-11 w-11 shrink-0 items-center justify-center">
            <ChatAvatar name={otherName} url={otherUser?.avatar_url} />
          </Link>
        ) : (
          <ChatAvatar name={otherName} url={otherUser?.avatar_url} />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-base font-bold leading-tight">
            <span className="truncate">{otherName}</span>
            {otherUser?.id_verified && !otherLeft && (
              <span role="img" aria-label="ID verified" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-teal">
                <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} aria-hidden="true" />
              </span>
            )}
          </p>
          {subLine && <p className="truncate text-xs text-muted-foreground">{subLine}</p>}
        </div>
        {!otherLeft && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More options" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--nn-soft)]">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 rounded-2xl p-1.5">
              {profileLink && (
                <DropdownMenuItem asChild className="flex-col items-start gap-0.5 rounded-xl py-2.5">
                  <Link to={profileLink}>
                    <span className="font-semibold">View {otherName}’s profile</span>
                    <span className="text-xs text-muted-foreground">Reviews, pets they know and more</span>
                  </Link>
                </DropdownMenuItem>
              )}
              {liveSit && context?.sit_id ? (
                <DropdownMenuItem asChild className="flex-col items-start gap-0.5 rounded-xl py-2.5">
                  <Link to={`/sits/${context.sit_id}`}>
                    <span className="font-semibold">Go to the sit</span>
                    <span className="text-xs text-muted-foreground">{dates ? `${dates} · ` : ""}Welcome Guide and daily updates</span>
                  </Link>
                </DropdownMenuItem>
              ) : conversation.listing ? (
                <DropdownMenuItem asChild className="flex-col items-start gap-0.5 rounded-xl py-2.5">
                  <Link to={`/listing/${conversation.listing.id}`}>
                    <span className="font-semibold">View the listing</span>
                    <span className="text-xs text-muted-foreground">{conversation.listing.title}</span>
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {phone.state?.i_am_sharing ? (
                <DropdownMenuItem onSelect={doStop} className="flex-col items-start gap-0.5 rounded-xl py-2.5">
                  <span className="font-semibold">Stop sharing my number</span>
                  <span className="text-xs text-muted-foreground">{otherName} will no longer see it</span>
                </DropdownMenuItem>
              ) : canShare ? (
                <DropdownMenuItem onSelect={() => setShareSheetOpen(true)} className="flex-col items-start gap-0.5 rounded-xl py-2.5">
                  <span className="font-semibold">Share my phone number</span>
                  <span className="text-xs text-muted-foreground">Only {otherName} will see it</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled aria-disabled="true" className="flex-col items-start gap-0.5 rounded-xl py-2.5 opacity-100 data-[disabled]:opacity-100">
                  <span className="font-semibold text-muted-foreground">Share my phone number</span>
                  <span className="text-xs text-muted-foreground">Available once a sit is confirmed</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={reportChat} className="flex-col items-start gap-0.5 rounded-xl py-2.5">
                <span className="font-semibold text-[var(--nn-danger-text)]">Report this chat</span>
                <span className="text-xs text-muted-foreground">Tell the NomadNest team. Screenshots are optional.</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {strip}

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-5" role="log" aria-label={`Messages with ${otherName}`} aria-live="polite">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
                <Skeleton className="h-16 w-48 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {!sitConfirmedOnce && !otherLeft && conversation.listing && (
              <p role="note" className={cn(NOTE, "bg-[var(--nn-tip-bg)] text-[var(--nn-tip-text)]")}>
                {NOT_CONFIRMED_NOTE}
              </p>
            )}
            {messages.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello!</p>
            )}
            {messages.map((message) => {
              const isOwn = message.sender_user_id === user?.id;
              const isRead = !!message.read_at;
              const day = dayLabel(message.created_at);
              const separator =
                day !== lastDay ? (
                  <p className="self-center rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground">{day}</p>
                ) : null;
              lastDay = day;
              const meta = (
                <span className={cn("flex items-center gap-1 text-[11px] text-muted-foreground", isOwn && "justify-end")}>
                  {timeOf(message.created_at)}
                  {isOwn &&
                    (isRead ? (
                      <>
                        {" · Read"}
                        <CheckCheck className="h-3.5 w-3.5 text-brand-teal-text" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">Sent</span>
                      </>
                    ))}
                </span>
              );
              const reportBtn = !isOwn && (
                <button
                  type="button"
                  aria-label="Report message"
                  onClick={() => openReport({ targetType: "message", targetId: message.id })}
                  className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Flag className="h-3.5 w-3.5" />
                </button>
              );

              let body: React.ReactNode;
              const share = parsePhoneShareMessage(message.body);

              if (share) {
                body = (
                  <PhoneShareMessage
                    action={share}
                    isOwn={isOwn}
                    isLatest={latestShareId[message.sender_user_id] === message.id}
                    otherName={otherName}
                    state={phone.state}
                    onStop={doStop}
                    stopping={phone.stop.isPending}
                  />
                );
              } else if (message.guide_question_id) {
                const linked = guideQuestionById.get(message.guide_question_id);
                body = (
                  <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                    <GuideQuestionCard
                      question={linked?.question ?? questionFromBody(message.body)}
                      isEmergency={linked?.is_emergency ?? /^Urgent from your Welcome Guide:/i.test(message.body)}
                      isOwn={isOwn}
                      time={timeOf(message.created_at)}
                    />
                  </div>
                );
              } else {
                const checkin = parseCheckinMessage(message.body);
                if (checkin?.kind === "daily_update") {
                  body = (
                    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                      <ChatUpdateCard
                        update={checkin}
                        sitId={activeSit?.sit_id ?? context?.sit_id ?? null}
                        isOwn={isOwn}
                        viewerIsOwner={isCurrentUserOwner}
                        time={timeOf(message.created_at)}
                        senderName={otherName || "your Nomad"}
                      />
                    </div>
                  );
                } else if (checkin) {
                  // Older care check-ins (fed, medication, walk).
                  const Icon = KIND_ICON[checkin.kind as CheckinKind] || Bone;
                  body = (
                    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                      <div className="max-w-[80%] overflow-hidden rounded-2xl border border-[var(--nn-border)] bg-[var(--nn-soft)]">
                        <div className="flex items-center gap-2 px-3 py-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--nn-tint)]">
                            <Icon className="h-4 w-4 text-[var(--nn-accent-dark)]" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{checkin.label}</span>
                            <span className="block text-xs text-muted-foreground">{timeOf(message.created_at)}</span>
                          </span>
                        </div>
                        {checkin.note && <p className="whitespace-pre-wrap break-words px-3 pb-2 text-sm">{checkin.note}</p>}
                        {checkin.photo && (
                          <img src={checkin.photo} alt={`${checkin.label} check-in photo`} loading="lazy" className="max-h-60 w-full object-cover" />
                        )}
                      </div>
                    </div>
                  );
                } else {
                  const imageMsg = parseImageMessage(message.body);
                  if (imageMsg) {
                    const imageSrc = imageMsg.path ? chatPhotoUrls[imageMsg.path] : imageMsg.url;
                    body = (
                      <div className={cn("group flex", isOwn ? "justify-end" : "justify-start")}>
                        {reportBtn}
                        <div className={cn("flex max-w-[80%] flex-col gap-1", isOwn && "items-end")}>
                          <div className={cn("overflow-hidden rounded-[18px]", isOwn ? "bg-[var(--nn-accent)] text-primary-foreground" : "border border-[var(--nn-border)] bg-card")}>
                            {imageSrc ? (
                              <a href={imageSrc} target="_blank" rel="noopener noreferrer">
                                <img src={imageSrc} alt={imageMsg.caption || "Shared photo"} loading="lazy" className="max-h-72 w-full cursor-pointer object-cover" />
                              </a>
                            ) : (
                              <div className="flex h-40 w-56 max-w-full items-center justify-center bg-muted">
                                <Loader2 className="h-5 w-5 animate-spin opacity-60" aria-label="Loading photo" />
                              </div>
                            )}
                            {imageMsg.caption && <p className="whitespace-pre-wrap break-words px-3.5 py-2 text-[15px]">{imageMsg.caption}</p>}
                          </div>
                          {meta}
                        </div>
                      </div>
                    );
                  } else {
                    // Text (and "[Photo removed]" bodies after a photo clean-up).
                    // The recipient reads the translation (their language); the
                    // sender always sees what they wrote.
                    const translated = !isOwn && !!message.translated_body;
                    const original = !translated || showingOriginal.has(message.id);
                    const guidePrompt = guidePromptByMessageId.get(message.id);
                    const fromLang = englishLanguage(message.message_lang);
                    body = (
                      <>
                        {!isOwn && mentionsMoney(message.body) && (
                          <p role="note" className={cn(NOTE, "bg-[var(--nn-tip-bg)] text-[var(--nn-tip-text)]")}>
                            {MONEY_NOTE}{" "}
                            <button type="button" onClick={() => openReport({ targetType: "message", targetId: message.id })} className="font-bold underline underline-offset-2">
                              Report
                            </button>
                          </p>
                        )}
                        <div className={cn("group flex", isOwn ? "justify-end" : "justify-start")}>
                          {reportBtn}
                          <div className={cn("flex max-w-[80%] flex-col gap-1", isOwn && "items-end")}>
                            <div
                              className={cn(
                                "rounded-[18px] px-3.5 py-2.5 text-[15px] leading-normal",
                                isOwn ? "rounded-br-md bg-[var(--nn-accent)] text-primary-foreground" : "rounded-bl-md border border-[var(--nn-border)] bg-card",
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words">{original ? message.body : message.translated_body}</p>
                            </div>
                            {translated && (
                              <button
                                type="button"
                                onClick={() => toggleOriginal(message.id)}
                                className="inline-flex min-h-[44px] items-center gap-1 self-start text-xs font-semibold text-[var(--nn-accent-dark)] hover:underline"
                              >
                                <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                                {original
                                  ? `See in ${languageLabel(message.translated_lang) ?? "your language"}`
                                  : `Translated${fromLang ? ` from ${fromLang}` : ""} · See original`}
                              </button>
                            )}
                            {meta}
                          </div>
                        </div>
                        {guidePrompt && <AddToGuidePrompt messageId={message.id} replyText={message.body} candidates={guidePrompt} />}
                      </>
                    );
                  }
                }
              }

              return (
                <Fragment key={message.id}>
                  {separator}
                  {body}
                </Fragment>
              );
            })}
            {showAsk && (
              <PhoneShareAsk
                otherName={otherName}
                verified={!!phone.state?.my_phone_verified}
                onShare={() => setShareSheetOpen(true)}
                onNotNow={notNow}
              />
            )}
            {otherLeft && (
              <p role="note" className={cn(NOTE, "bg-muted text-muted-foreground")}>
                This member has left NomadNest. Their name and photo are no longer shown.
              </p>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {isOtherTyping && (
        <div className="flex shrink-0 items-center gap-2 px-4 py-1.5 text-sm text-muted-foreground" aria-live="polite">
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
          </span>
          {typingUserName || otherName} is typing…
        </div>
      )}

      {/* Today's update: one pill for the most relevant live sit between the
          two of you (the Inbox merges a pair's chats). */}
      {activeSit && (
        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--nn-line)] px-3 py-2">
          <Link
            to={`/sits/${activeSit.sit_id}`}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-sm font-semibold",
              activeSit.sent_today
                ? "border-transparent bg-[var(--nn-ok-bg)] text-brand-teal-text"
                : activeSit.role === "sitter" && activeSit.due_today
                  ? "border-transparent bg-[var(--nn-accent)] text-primary-foreground"
                  : "border-[var(--nn-border)] bg-card text-muted-foreground",
            )}
          >
            {activeSit.sent_today ? <Check className="h-4 w-4" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
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
          <Link to={`/sits/${activeSit.sit_id}`} className="ml-auto inline-flex min-h-[44px] items-center whitespace-nowrap text-sm font-semibold text-[var(--nn-accent-dark)] hover:underline">
            See updates
          </Link>
        </div>
      )}

      {/* Composer */}
      {otherLeft ? (
        <p className="shrink-0 border-t border-[var(--nn-border)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground">
          This member has left NomadNest. You can still read your conversation.
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="shrink-0 border-t border-[var(--nn-border)] bg-background px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:px-4 md:pb-3"
        >
          {contactKind && (
            <div role="alert" className="mb-2 rounded-2xl border border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] p-3 text-sm text-[var(--nn-tip-text)]">
              <p>
                <strong>This looks like {CONTACT_LABEL[contactKind]}.</strong> For your safety, keep contact details in NomadNest until a sit is confirmed.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setContactDismissed(true);
                    inputRef.current?.focus();
                  }}
                  className={nnButton("secondary", "min-h-[40px] px-4")}
                >
                  Edit message
                </button>
                <button type="button" onClick={send} className={nnButton("secondary", "min-h-[40px] px-4")}>
                  Send anyway
                </button>
              </div>
            </div>
          )}
          {moneyWarn && (
            <div role="alert" className="mb-2 rounded-2xl border border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] p-3 text-sm text-[var(--nn-tip-text)]">
              <p>{MONEY_NOTE}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setMoneyDismissed(true)} className={nnButton("secondary", "min-h-[40px] px-4")}>
                  Got it
                </button>
                <button type="button" onClick={reportChat} className={nnButton("secondary", "min-h-[40px] px-4")}>
                  Report
                </button>
              </div>
            </div>
          )}
          {pendingPhoto && (
            <div className="mb-2 flex items-center gap-2">
              <div className="relative">
                <img src={pendingPhoto.preview} alt="Photo to send" className="h-16 w-16 rounded-xl border border-[var(--nn-border)] object-cover" />
                <button
                  type="button"
                  onClick={() => setPendingPhoto(null)}
                  aria-label="Remove photo"
                  className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--nn-border)] bg-card text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Add a caption or just send the photo</p>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => photoLibraryRef.current?.click()}
              disabled={isSending || photoUploading}
              aria-label="Add a photo"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--nn-border)] bg-card text-foreground disabled:opacity-50"
            >
              {photoUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            </button>
            <input ref={photoLibraryRef} type="file" accept="image/*" onChange={handlePhotoFile} className="hidden" />
            <label htmlFor="chat-input" className="sr-only">
              Write a message
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={1}
              value={newMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={pendingPhoto ? "Add a caption…" : `Message ${otherName}…`}
              disabled={isSending}
              className={cn(
                "min-h-[44px] flex-1 resize-none rounded-[22px] border-[1.5px] bg-card px-4 py-2.5 text-[15px] leading-snug outline-none placeholder:text-muted-foreground focus:border-[var(--nn-accent)]",
                contactKind || moneyWarn ? "border-[var(--nn-tip-border)]" : "border-[var(--nn-border)]",
              )}
            />
            <button
              type="submit"
              disabled={(!newMessage.trim() && !pendingPhoto) || isSending}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--nn-accent)] text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
      )}

      <PhoneShareSheet
        open={shareSheetOpen}
        onOpenChange={setShareSheetOpen}
        otherName={otherName}
        state={phone.state}
        onConfirm={doShare}
        sharing={phone.share.isPending}
      />
    </div>
  );
};
