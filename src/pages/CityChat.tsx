import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock, Send, Users, MapPin } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import MessageBubble, { type BubbleMessage } from "@/components/city-chat/MessageBubble";
import ThreadPanel from "@/components/city-chat/ThreadPanel";

interface Room {
  id: string;
  city: string;
  country: string;
}

interface SenderProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface ChatMessage {
  id: string;
  room_id: string;
  sender_user_id: string;
  content: string;
  created_at: string;
  parent_message_id: string | null;
  sender?: SenderProfile | null;
}

interface ThreadInfo {
  replyCount: number;
  avatars: string[];
}

const MESSAGE_PAGE_SIZE = 100;

const CityChat = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [room, setRoom] = useState<Room | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<Record<string, ThreadInfo>>({});
  const [openThread, setOpenThread] = useState<BubbleMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nomadCount, setNomadCount] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profileCache = useRef<Map<string, SenderProfile>>(new Map());

  const { byMessage, toggleReaction } = useMessageReactions(roomId, !!hasAccess);
  const reactionsFor = useCallback(
    (messageId: string) => byMessage.get(messageId) ?? [],
    [byMessage],
  );

  const hydrateSenders = async (msgs: ChatMessage[]): Promise<ChatMessage[]> => {
    const missing = Array.from(
      new Set(msgs.map((m) => m.sender_user_id).filter((id) => !profileCache.current.has(id))),
    );
    if (missing.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url")
        .in("id", missing);
      (data || []).forEach((p) => profileCache.current.set(p.id, p));
    }
    return msgs.map((m) => ({ ...m, sender: profileCache.current.get(m.sender_user_id) || null }));
  };

  const loadThreadSummaries = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase.rpc("city_chat_thread_summaries", { p_room_id: roomId });
    const map: Record<string, ThreadInfo> = {};
    (data || []).forEach((row) => {
      map[row.parent_message_id] = {
        replyCount: Number(row.reply_count),
        avatars: (row.replier_avatars || []) as string[],
      };
    });
    setThreads(map);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !user) return;
    let mounted = true;

    const init = async () => {
      setLoading(true);

      const { data: roomData, error: roomErr } = await supabase
        .from("city_chat_rooms")
        .select("id, city, country")
        .eq("id", roomId)
        .maybeSingle();

      if (roomErr || !roomData) {
        if (mounted) {
          setRoom(null);
          setLoading(false);
        }
        return;
      }
      if (mounted) setRoom(roomData);

      const { data: accessData } = await supabase.rpc("can_access_city_chat", {
        p_room_id: roomId,
        p_user_id: user.id,
      });
      const access = !!accessData;
      if (mounted) setHasAccess(access);

      // nomads-here count: visible sitters in this city
      const { count } = await supabase
        .from("sitter_profiles")
        .select("user_id, profiles!inner(city)", { count: "exact", head: true })
        .eq("is_visible", true)
        .ilike("profiles.city", roomData.city);
      if (mounted) setNomadCount(count || 0);

      if (access) {
        const { data: msgs } = await supabase
          .from("city_chat_messages")
          .select("*")
          .eq("room_id", roomId)
          .is("parent_message_id", null)
          .order("created_at", { ascending: false })
          .limit(MESSAGE_PAGE_SIZE);
        const ordered = ((msgs || []) as ChatMessage[]).slice().reverse();
        const hydrated = await hydrateSenders(ordered);
        if (mounted) {
          setMessages(hydrated);
          setHasMore((msgs || []).length === MESSAGE_PAGE_SIZE);
        }
        await loadThreadSummaries();
      }

      if (mounted) setLoading(false);
    };

    init();
    return () => {
      mounted = false;
    };
  }, [roomId, user, loadThreadSummaries]);

  // Realtime
  useEffect(() => {
    if (!roomId || !hasAccess) return;
    const channel = supabase
      .channel(`city_chat_${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "city_chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
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
                  avatars: avatar && !existing.avatars.includes(avatar)
                    ? [...existing.avatars, avatar].slice(0, 3)
                    : existing.avatars,
                },
              };
            });
            return;
          }
          const [hydrated] = await hydrateSenders([msg]);
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, hydrated]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, hasAccess]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
    const { error } = await supabase.from("city_chat_messages").insert({
      room_id: roomId,
      sender_user_id: user.id,
      content: body,
    });
    if (error) {
      toast({
        title: "Could not send message",
        description: error.message,
        variant: "destructive",
      });
      setInput(body);
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 container max-w-3xl">
          <Skeleton className="h-12 w-64 mb-4" />
          <Skeleton className="h-[60vh] w-full" />
        </main>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 container text-center">
          <p className="text-muted-foreground">City chat not found.</p>
          <Button asChild className="mt-4">
            <Link to="/find-nomads">Back to Nomads</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20 pb-6">
        <div className="container max-w-3xl flex flex-col h-[calc(100vh-7rem)]">
          {/* Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/find-nomads")}
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-display font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                {room.city}
                <HelpTooltip
                  label="About city chat"
                  content="City chats are local community spaces for nomads in the same area to swap tips, meet up, and ask questions. Reply in a thread to keep the room tidy."
                />
              </h1>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <span>{room.country}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {nomadCount} nomad{nomadCount === 1 ? "" : "s"} here
                </span>
              </p>
            </div>
          </div>

          {!hasAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Lock className="w-7 h-7 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold">This chat is locked</h2>
              <p className="text-muted-foreground max-w-md">
                To join the {room.city} chat, you need a confirmed sit in this city
                (active or starting within 7 days), or to be a visible nomad based here.
              </p>
              <Button asChild>
                <Link to="/browse-sits">Browse sits</Link>
              </Button>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 py-4" ref={scrollRef}>
                {hasMore && (
                  <div className="text-center mb-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                )}
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    No messages yet. Say hi to other nomads in {room.city}!
                  </div>
                ) : (
                  <div className="space-y-4 px-1">
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
              </ScrollArea>

              <form onSubmit={handleSend} className="flex gap-2 pt-3 border-t border-border">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Message #${room.city.toLowerCase()}…`}
                  disabled={sending}
                />
                <Button type="submit" disabled={!input.trim() || sending}>
                  <Send className="w-4 h-4" />
                </Button>
              </form>

              <ThreadPanel
                roomId={roomId}
                parent={openThread}
                onClose={() => {
                  setOpenThread(null);
                  loadThreadSummaries();
                }}
                reactionsFor={reactionsFor}
                onToggleReaction={toggleReaction}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default CityChat;
