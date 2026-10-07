import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Lock, MoreHorizontal, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import { useCityChatThreadSubscriptions } from "@/hooks/useCityChatThreadSubscriptions";
import { useCityChatRooms } from "@/hooks/useCityChatRooms";
import { useCityCatchup } from "@/hooks/useCityCatchup";
import { useReport } from "@/components/reports/ReportContext";
import MessageBubble, { TEAM_USER_ID, formatStamp, type BubbleMessage } from "@/components/city-chat/MessageBubble";
import ThreadPanel from "@/components/city-chat/ThreadPanel";
import CityChatsSection from "@/components/city-chat/CityChatsSection";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import { RoleTheme, nnButton } from "@/components/nn/ui";
import { cn } from "@/lib/utils";

interface Room {
  id: string;
  city: string;
  country: string;
  city_key: string;
}

interface SenderProfile {
  id: string;
  first_name: string | null;
  avatar_url: string | null;
}

interface ChatMessage {
  id: string;
  room_id: string;
  sender_user_id: string;
  content: string;
  created_at: string;
  parent_message_id: string | null;
  is_pinned?: boolean;
  sender?: SenderProfile | null;
}

interface ThreadInfo {
  replyCount: number;
  avatars: string[];
}

const MESSAGE_PAGE_SIZE = 100;
const BACK = "/inbox?tab=city-chats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Desktop (lg+): the thread opens in the right column instead of a sheet. */
const useIsDesktop = () => {
  const query = "(min-width: 1024px)";
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
};

const CityChat = () => {
  const { roomId: routeParam } = useParams<{ roomId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { openReport } = useReport();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();

  const [room, setRoom] = useState<Room | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<Record<string, ThreadInfo>>({});
  const [openThread, setOpenThread] = useState<BubbleMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nomadCount, setNomadCount] = useState<number>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  // When the member last opened this room (before now), for "Catch me up".
  const [previousRead, setPreviousRead] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ bullets: string[]; days: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profileCache = useRef<Map<string, SenderProfile>>(new Map());

  const roomId = room?.id;
  const { rooms } = useCityChatRooms();
  const myRoom = rooms.find((r) => r.room_id === roomId);
  const catchup = useCityCatchup();

  const { byMessage, toggleReaction } = useMessageReactions(roomId, !!hasAccess);
  const reactionsFor = useCallback((messageId: string) => byMessage.get(messageId) ?? [], [byMessage]);
  const { isSubscribed, toggle: toggleThreadWatch } = useCityChatThreadSubscriptions();

  const hydrateSenders = async (msgs: ChatMessage[]): Promise<ChatMessage[]> => {
    const missing = Array.from(new Set(msgs.map((m) => m.sender_user_id).filter((id) => !profileCache.current.has(id))));
    if (missing.length > 0) {
      // First names and photos only.
      const { data } = await supabase.from("profiles").select("id, first_name, avatar_url").in("id", missing);
      (data || []).forEach((p) => profileCache.current.set(p.id, p));
    }
    return msgs.map((m) => ({ ...m, sender: profileCache.current.get(m.sender_user_id) || null }));
  };

  const loadThreadSummaries = useCallback(
    async (id?: string) => {
      const target = id ?? roomId;
      if (!target) return;
      const { data } = await supabase.rpc("city_chat_thread_summaries", { p_room_id: target });
      const map: Record<string, ThreadInfo> = {};
      (data || []).forEach((row) => {
        map[row.parent_message_id] = { replyCount: Number(row.reply_count), avatars: (row.replier_avatars || []) as string[] };
      });
      setThreads(map);
    },
    [roomId],
  );

  useEffect(() => {
    if (!routeParam || !user) return;
    let mounted = true;

    const init = async () => {
      setLoading(true);
      setSummary(null);
      // The URL can carry either the room's UUID (older links) or its city key.
      const query = supabase.from("city_chat_rooms").select("id, city, country, city_key");
      const { data: roomData, error: roomErr } = await (UUID_RE.test(routeParam) ? query.eq("id", routeParam) : query.eq("city_key", routeParam)).maybeSingle();

      if (roomErr || !roomData) {
        if (mounted) {
          setRoom(null);
          setLoading(false);
        }
        return;
      }
      if (mounted) setRoom(roomData);

      const [{ data: accessData }, { data: countData }, { data: muteRow }] = await Promise.all([
        supabase.rpc("can_access_city_chat", { p_room_id: roomData.id, p_user_id: user.id }),
        // Nomads here: the same rule as access, so the count never drifts.
        supabase.rpc("city_chat_nomad_count", { p_room_id: roomData.id }),
        supabase.from("city_chat_mutes").select("room_id").eq("room_id", roomData.id).eq("user_id", user.id).maybeSingle(),
      ]);
      const access = !!accessData;
      if (mounted) {
        setHasAccess(access);
        setNomadCount(countData ?? 0);
        setMuted(!!muteRow);
      }

      if (access) {
        // Remember this visit; keep the previous one for "Catch me up".
        const { data: prev } = await supabase.rpc("mark_city_chat_room_read", { p_room_id: roomData.id });
        if (mounted) setPreviousRead((prev as string | null) ?? null);
        queryClient.invalidateQueries({ queryKey: ["my-city-chat-rooms"] });

        const { data: pinnedRows } = await supabase
          .from("city_chat_messages")
          .select("*")
          .eq("room_id", roomData.id)
          .eq("is_pinned", true)
          .order("created_at", { ascending: true });
        const hydratedPinned = await hydrateSenders((pinnedRows || []) as ChatMessage[]);
        // Keep the official topics in a stable, predictable order.
        const order = ["🚨", "🐾", "💻"];
        hydratedPinned.sort((a, b) => order.findIndex((e) => a.content.startsWith(e)) - order.findIndex((e) => b.content.startsWith(e)));
        if (mounted) setPinned(hydratedPinned);

        const { data: msgs } = await supabase
          .from("city_chat_messages")
          .select("*")
          .eq("room_id", roomData.id)
          .is("parent_message_id", null)
          .eq("is_pinned", false)
          .order("created_at", { ascending: false })
          .limit(MESSAGE_PAGE_SIZE);
        const ordered = ((msgs || []) as ChatMessage[]).slice().reverse();
        const hydrated = await hydrateSenders(ordered);
        if (mounted) {
          setMessages(hydrated);
          setHasMore((msgs || []).length === MESSAGE_PAGE_SIZE);
        }
        await loadThreadSummaries(roomData.id);
      }

      if (mounted) setLoading(false);
    };

    init();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParam, user]);

  // Deep links from notifications: ?thread=<parent_message_id> opens that thread.
  useEffect(() => {
    if (!hasAccess || !roomId) return;
    const threadId = searchParams.get("thread");
    if (!threadId) return;

    let mounted = true;
    (async () => {
      const alreadyLoaded = pinned.find((m) => m.id === threadId) ?? messages.find((m) => m.id === threadId);
      let target: ChatMessage | null = alreadyLoaded ?? null;
      if (!target) {
        const { data } = await supabase.from("city_chat_messages").select("*").eq("id", threadId).eq("room_id", roomId).maybeSingle();
        if (data) {
          const [hydrated] = await hydrateSenders([data as ChatMessage]);
          target = hydrated;
        }
      }
      if (mounted && target) setOpenThread(target);
    })();

    // Drop the param either way so refreshing the page doesn't reopen it.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("thread");
        return next;
      },
      { replace: true },
    );

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, roomId]);

  // Realtime
  useEffect(() => {
    if (!roomId || !hasAccess) return;
    const channel = supabase
      .channel(`city_chat_${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "city_chat_messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const msg = payload.new as ChatMessage;
          if (msg.parent_message_id) {
            const avatar = profileCache.current.get(msg.sender_user_id)?.avatar_url;
            setThreads((prev) => {
              const existing = prev[msg.parent_message_id!] ?? { replyCount: 0, avatars: [] };
              return {
                ...prev,
                [msg.parent_message_id!]: {
                  replyCount: existing.replyCount + 1,
                  avatars: avatar && !existing.avatars.includes(avatar) ? [...existing.avatars, avatar].slice(0, 3) : existing.avatars,
                },
              };
            });
            return;
          }
          if (msg.is_pinned) return;
          const [hydrated] = await hydrateSenders([msg]);
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, hydrated]));
          // Reading it live counts as read.
          supabase.rpc("mark_city_chat_room_read", { p_room_id: roomId }).then(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, hasAccess]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const loadMore = async () => {
    if (!roomId || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[0].created_at;
    const { data } = await supabase
      .from("city_chat_messages")
      .select("*")
      .eq("room_id", roomId)
      .is("parent_message_id", null)
      .eq("is_pinned", false)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    const ordered = ((data || []) as ChatMessage[]).slice().reverse();
    const hydrated = await hydrateSenders(ordered);
    setMessages((prev) => [...hydrated, ...prev]);
    setHasMore((data || []).length === MESSAGE_PAGE_SIZE);
    setLoadingMore(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !roomId || !user || sending) return;
    setSending(true);
    const body = input.trim();
    setInput("");
    const { error } = await supabase.from("city_chat_messages").insert({ room_id: roomId, sender_user_id: user.id, content: body });
    if (error) {
      toast({ title: "Could not send message", description: "Please try again.", variant: "destructive" });
      setInput(body);
    }
    setSending(false);
  };

  const toggleMute = async (next: boolean) => {
    if (!roomId || !user) return;
    setMuted(next);
    const { error } = next
      ? await supabase.from("city_chat_mutes").insert({ room_id: roomId, user_id: user.id })
      : await supabase.from("city_chat_mutes").delete().eq("room_id", roomId).eq("user_id", user.id);
    if (error) {
      setMuted(!next);
      toast({ title: "Couldn't change that", description: "Please try again.", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["my-city-chat-rooms"] });
    toast({ title: next ? "Notifications muted for this room" : "Notifications on for this room" });
  };

  const runCatchUp = () => {
    if (!roomId) return;
    catchup.catchUp.mutate(
      { roomId, since: previousRead },
      {
        onSuccess: setSummary,
        onError: (err) => toast({ title: "Couldn't catch you up", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
      },
    );
  };

  const closeThread = () => {
    setOpenThread(null);
    loadThreadSummaries();
  };

  const shell = (children: React.ReactNode) => (
    <RoleTheme role="sitter" className="flex h-[100svh] flex-col overflow-hidden">
      <Navbar wide />
      <main className="min-h-0 flex-1 pb-16 pt-16 md:pb-0">
        <div className="mx-auto h-full max-w-[1400px] md:px-4 md:py-4 lg:px-6">
          <div className="flex h-full min-h-0 overflow-hidden bg-background md:rounded-[24px] md:border md:border-[var(--nn-border)]">
            <aside aria-label="Your city chats" className="hidden w-[320px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-[var(--nn-border)] px-4 py-5 lg:flex">
              <h2 className="font-display text-2xl font-normal">City Chats</h2>
              <CityChatsSection selectedKey={room?.city_key} />
            </aside>
            {children}
          </div>
        </div>
      </main>
    </RoleTheme>
  );

  const backButton = (
    <Link to={BACK} aria-label="Back to City Chats" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--nn-soft)]">
      <ArrowLeft className="h-5 w-5" />
    </Link>
  );

  if (loading) {
    return shell(
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-[50vh] w-full" />
      </div>,
    );
  }

  if (!room) {
    return shell(
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-display text-xl">City Chat not found</p>
        <Link to={BACK} className={nnButton("primary")}>Back to City Chats</Link>
      </div>,
    );
  }

  const endDate = myRoom?.sit_end
    ? new Date(`${myRoom.sit_end}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;
  const othersMessages = messages.filter((m) => m.sender_user_id !== user?.id && m.sender_user_id !== TEAM_USER_ID).slice(-20).reverse();

  return shell(
    <>
      <section aria-label={`${room.city} City Chat`} className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--nn-border)] px-2 py-2 md:px-4">
          {backButton}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-normal leading-tight">{room.city} City Chat</h1>
            <p className="truncate text-xs text-muted-foreground">
              {nomadCount} {nomadCount === 1 ? "Nomad" : "Nomads"} here
              {hasAccess && endDate ? ` · open for you until ${endDate}` : ""}
            </p>
          </div>
          {hasAccess && (
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="More options" aria-haspopup="dialog" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--nn-soft)]">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          )}
        </header>

        {!hasAccess ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted" aria-hidden="true">
              <Lock className="h-7 w-7 text-muted-foreground" />
            </span>
            <h2 className="font-display text-2xl font-normal">This chat is locked</h2>
            <p className="max-w-md text-[15px] text-muted-foreground">
              The {room.city} City Chat opens for you when you have a confirmed or in-progress sit in {room.city}, {room.country}.
            </p>
            <Link to="/browse-sits" className={nnButton("primary")}>Browse sits</Link>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div role="list" aria-label="Pinned topics" className="flex shrink-0 gap-2 overflow-x-auto border-b border-[var(--nn-line)] px-4 py-3">
                {pinned.map((m) => {
                  const n = threads[m.id]?.replyCount ?? 0;
                  return (
                    <button
                      key={m.id}
                      role="listitem"
                      type="button"
                      onClick={() => setOpenThread(m)}
                      className="flex min-h-[56px] shrink-0 flex-col items-start justify-center rounded-2xl border border-[var(--nn-border)] bg-card px-3.5 py-2 text-left hover:bg-[var(--nn-soft)]"
                    >
                      <span className="whitespace-nowrap text-sm font-bold">{m.content}</span>
                      <span className="text-xs text-muted-foreground">{n ? `${n} ${n === 1 ? "reply" : "replies"}` : "Start the thread"}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5" role="log" aria-label={`Messages in ${room.city}`}>
              {summary && (
                <section aria-label="Catch me up" className="mb-4 rounded-[20px] border border-[var(--nn-border)] bg-[var(--nn-soft)] p-4">
                  <p className="text-[15px] font-bold">✦ While you were away</p>
                  {summary.bullets.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
                      {summary.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[15px]">Nothing important was said while you were away.</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    AI summary of the last {summary.days} {summary.days === 1 ? "day" : "days"}. It may miss things.
                  </p>
                </section>
              )}
              {hasMore && (
                <div className="mb-4 text-center">
                  <button type="button" onClick={loadMore} disabled={loadingMore} className={nnButton("ghost")}>
                    {loadingMore ? "Loading…" : "Load earlier messages"}
                  </button>
                </div>
              )}
              {messages.length === 0 ? (
                <p className="py-12 text-center text-[15px] text-muted-foreground">No messages yet. Say hi to other Nomads in {room.city}!</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      isOwn={m.sender_user_id === user?.id}
                      reactions={reactionsFor(m.id)}
                      onToggleReaction={(emoji) => toggleReaction(m.id, emoji)}
                      thread={threads[m.id]}
                      onOpenThread={() => setOpenThread(m)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-[var(--nn-border)] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:px-4 md:pb-3">
              {catchup.visible && !summary && (
                <button type="button" onClick={runCatchUp} disabled={catchup.catchUp.isPending} className={nnButton("secondary", "mb-2")}>
                  {catchup.catchUp.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  ✦ Catch me up
                </button>
              )}
              <form onSubmit={handleSend} className="flex items-end gap-2">
                <label htmlFor="city-input" className="sr-only">Message {room.city} Nomads</label>
                <input
                  id="city-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Message ${room.city} Nomads…`}
                  disabled={sending}
                  className="h-11 min-w-0 flex-1 rounded-full border-[1.5px] border-[var(--nn-border)] bg-card px-4 text-[15px] outline-none focus:border-[var(--nn-accent)]"
                />
                <button type="submit" disabled={!input.trim() || sending} aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--nn-accent)] text-primary-foreground disabled:opacity-50">
                  <Send className="h-5 w-5" />
                </button>
              </form>
              <p className="mt-1.5 text-center text-xs text-muted-foreground">
                Only Nomads with a confirmed sit in {room.city} can read this. First names only.
              </p>
            </div>
          </>
        )}
      </section>

      {hasAccess && (
        <ThreadPanel
          variant={isDesktop ? "panel" : "sheet"}
          roomId={roomId}
          parent={openThread}
          onClose={closeThread}
          reactionsFor={reactionsFor}
          onToggleReaction={toggleReaction}
          isSubscribed={openThread ? isSubscribed(openThread.id) : false}
          onToggleSubscription={() => openThread && toggleThreadWatch(openThread.id)}
        />
      )}

      <ResponsiveSheet open={menuOpen} onOpenChange={setMenuOpen} title={`${room.city} City Chat`} description="Chat rules, notifications and reporting.">
        <div className="flex flex-col gap-4">
          <section aria-label="Chat rules" className="rounded-2xl bg-[var(--nn-soft)] p-4">
            <h2 className="text-[15px] font-bold">Chat rules</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
              <li>Be kind and helpful.</li>
              <li>No selling, no paid offers, no sits outside NomadNest.</li>
              <li>Never share a Pet Parent's address or anyone's private details.</li>
            </ul>
          </section>
          <label className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-[var(--nn-border)] px-4">
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">Mute notifications</span>
              <span className="text-xs text-muted-foreground">No push alerts for replies in this room. They still show in the app.</span>
            </span>
            <Switch checked={muted} onCheckedChange={toggleMute} aria-label="Mute notifications for this room" />
          </label>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setReportOpen(true);
            }}
            className={nnButton("secondary", "w-full text-[var(--nn-danger-text)]")}
          >
            Report a message or member
          </button>
        </div>
      </ResponsiveSheet>

      <ResponsiveSheet open={reportOpen} onOpenChange={setReportOpen} title="Report a message or member" description="Choose the message you want to report.">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Choose the message to report. The NomadNest team will see it. Screenshots are optional. To report a member, open their profile and use Report there.
          </p>
          {othersMessages.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No messages from other Nomads yet.</p>
          ) : (
            othersMessages.map((m) => (
              <div key={m.id} className="flex items-start gap-3 rounded-2xl border border-[var(--nn-border)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    {(m.sender?.first_name || "Nomad").trim()} <span className="font-normal text-muted-foreground">· {formatStamp(m.created_at)}</span>
                  </p>
                  <p className="line-clamp-2 text-sm">{m.content}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReportOpen(false);
                    openReport({ targetType: "city_chat_message", targetId: m.id });
                  }}
                  className={nnButton("secondary", "shrink-0 px-4")}
                >
                  Report
                </button>
              </div>
            ))
          )}
        </div>
      </ResponsiveSheet>
    </>,
  );
};

export default CityChat;
