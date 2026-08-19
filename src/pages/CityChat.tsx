import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import { ArrowLeft, Lock, Send, Users, MapPin } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

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
  sender?: SenderProfile | null;
}

const MESSAGE_PAGE_SIZE = 100;

const formatStamp = (s: string) => {
  const d = new Date(s);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
};

const CityChat = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [room, setRoom] = useState<Room | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nomadCount, setNomadCount] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profileCache = useRef<Map<string, SenderProfile>>(new Map());

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
          .order("created_at", { ascending: false })
          .limit(MESSAGE_PAGE_SIZE);
        const ordered = (msgs || []).slice().reverse();
        const hydrated = await hydrateSenders(ordered);
        if (mounted) {
          setMessages(hydrated);
          setHasMore((msgs || []).length === MESSAGE_PAGE_SIZE);
        }
      }

      if (mounted) setLoading(false);
    };

    init();
    return () => {
      mounted = false;
    };
  }, [roomId, user]);

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
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    const ordered = (data || []).slice().reverse();
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
                  content="City chats are local community spaces for nomads in the same area to swap tips, meet up, and ask questions."
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
                    {messages.map((m) => {
                      const isOwn = m.sender_user_id === user?.id;
                      const initials = `${m.sender?.first_name?.[0] || ""}${m.sender?.last_name?.[0] || ""}`.toUpperCase() || "?";
                      const name = m.sender
                        ? `${m.sender.first_name || ""} ${m.sender.last_name || ""}`.trim() || "Nomad"
                        : "Nomad";
                      return (
                        <div
                          key={m.id}
                          className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}
                        >
                          {!isOwn && (
                            <Link to={`/sitter/${m.sender_user_id}`}>
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={m.sender?.avatar_url || undefined} />
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                            </Link>
                          )}
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-4 py-2",
                              isOwn
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted text-foreground rounded-bl-sm",
                            )}
                          >
                            {!isOwn && (
                              <Link
                                to={`/sitter/${m.sender_user_id}`}
                                className="text-xs font-semibold hover:underline block"
                              >
                                {name}
                              </Link>
                            )}
                            <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                            <p
                              className={cn(
                                "text-[10px] mt-1",
                                isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
                              )}
                            >
                              {formatStamp(m.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
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
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default CityChat;
