import { useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import Navbar from "@/components/layout/Navbar";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkAsRead,
  threadConversationId,
} from "@/hooks/useConversations";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import CityChatsSection from "@/components/city-chat/CityChatsSection";
import { MessageCircle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVisualViewport } from "@/hooks/useVisualViewport";


const Inbox = () => {
  const { user, loading, role } = useAuth();
  const { activeRole } = useActiveRole();
  const { toast } = useToast();

  const canUseCityChats = role !== "owner" && activeRole !== "owner";

  const [searchParams, setSearchParams] = useSearchParams();
  const conversationParam = searchParams.get("conversation");
  const [selectedId, setSelectedId] = useState<string | null>(conversationParam);
  const tabParam = searchParams.get("tab");
  const activeTab: "messages" | "city-chats" =
    canUseCityChats && tabParam === "city-chats" && !conversationParam ? "city-chats" : "messages";

  const setActiveTab = (tab: "messages" | "city-chats") => {
    if (tab === "city-chats") {
      setSelectedId(null);
      setSearchParams({ tab: "city-chats" });
    } else {
      setSearchParams({});
    }
  };

  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedId || conversation.conversation_ids.includes(selectedId || ""),
  ) || null;
  const selectedConversationIds = selectedConversation?.conversation_ids ?? [];
  const { data: messages = [], isLoading: messagesLoading } = useMessages(selectedConversationIds);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();
  const { unreadCount } = useUnreadMessages();
  const lastMarkedConversationRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  const mobileThreadOpen = isMobile && activeTab === "messages" && !!selectedId;
  const viewport = useVisualViewport(mobileThreadOpen);

  // The full-screen thread owns the screen: no page scrolling behind it.
  useEffect(() => {
    if (!mobileThreadOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileThreadOpen]);

  const clearNotificationTray = () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_NOTIFICATIONS' });
    }
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    nav.clearAppBadge?.();
  };

  // Determine if the other user is a sitter or owner based on current user's role in this conversation
  const getOtherUserRole = (): "sitter" | "owner" => {
    if (!selectedConversation || !user) return "sitter";
    // If current user is the owner in this conversation, other user is the sitter
    return selectedConversation.owner_user_id === user.id ? "sitter" : "owner";
  };

  // Update selected ID when URL param changes
  useEffect(() => {
    if (conversationParam && conversationParam !== selectedId) {
      setSelectedId(conversationParam);
    }
  }, [conversationParam]);

  // Update URL when selection changes
  const handleSelect = (id: string | null) => {
    setSelectedId(id);
    if (id) {
      if (lastMarkedConversationRef.current !== id) {
        lastMarkedConversationRef.current = id;
        const ids = conversations.find((conversation) => conversation.id === id)?.conversation_ids ?? [id];
        markAsRead.mutate(ids);
        clearNotificationTray();
      }
      setSearchParams({ conversation: id });
    } else {
      lastMarkedConversationRef.current = null;
      setSearchParams({});
    }
  };

  // Mark messages as read when conversation is selected (URL navigation path)
  useEffect(() => {
    if (selectedId && lastMarkedConversationRef.current !== selectedId) {
      lastMarkedConversationRef.current = selectedId;
      const ids = conversations.find(
        (conversation) => conversation.id === selectedId || conversation.conversation_ids.includes(selectedId),
      )?.conversation_ids ?? [selectedId];
      markAsRead.mutate(ids);
      clearNotificationTray();
    }
  }, [selectedId]);

  // Clear app badge immediately when inbox is open and all messages are read
  useEffect(() => {
    if (unreadCount !== 0) return;
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    nav.clearAppBadge?.();
  }, [unreadCount]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleSend = (body: string) => {
    if (selectedConversation) {
      sendMessage.mutate(
        {
          conversationId: threadConversationId(selectedConversation),
          body,
        },
        {
          onError: () => {
            toast({
              title: "Message not sent",
              description: "Something went wrong. Please try again.",
              variant: "destructive",
            });
          },
        }
      );
    }
  };


  const tabs = canUseCityChats && (
    <div className="flex bg-muted rounded-full p-1 gap-1 w-full">
      {([
        { id: "messages", label: "Messages", icon: MessageCircle },
        { id: "city-chats", label: "City Chats", icon: MapPin },
      ] as const).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setActiveTab(id)}
          aria-pressed={activeTab === id}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-1.5 rounded-full text-sm font-medium transition-colors",
            activeTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          )}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );

  const thread = (
    <MessageThread
      conversation={selectedConversation}
      messages={messages}
      isLoading={messagesLoading}
      onSend={handleSend}
      isSending={sendMessage.isPending}
      onBack={() => handleSelect(null)}
      otherUserRole={getOtherUserRole()}
    />
  );

  // Mobile, conversation open: the thread takes the whole visible screen
  // (above the top and bottom bars), sized to the visual viewport so the
  // message box sits just above the keyboard.
  if (mobileThreadOpen) {
    return (
      <div
        className="fixed inset-x-0 top-0 z-[60] flex flex-col bg-background"
        style={
          viewport
            ? { height: viewport.height, transform: `translateY(${viewport.offsetTop}px)` }
            : { height: "100dvh" }
        }
      >
        {thread}
      </div>
    );
  }

  return (
    <div className="h-[100svh] bg-background flex flex-col overflow-hidden">
      <Navbar />

      <main className="flex-1 min-h-0 pt-16 pb-16 md:pb-0">
        <div className="mx-auto h-full max-w-7xl md:px-4 md:py-4">
          {activeTab === "city-chats" ? (
            <div className="h-full overflow-y-auto px-4 pt-4 pb-6 md:px-0">
              <div className="mb-4 max-w-md space-y-3">
                <h1 className="text-2xl font-bold text-foreground">Messages</h1>
                {tabs}
              </div>
              <CityChatsSection className="mt-0 space-y-8" />
            </div>
          ) : (
            <div className="flex h-full min-h-0 overflow-hidden bg-card md:rounded-2xl md:border md:border-border">
              {/* Inbox list */}
              <div
                className={cn(
                  "flex w-full flex-col border-border md:w-80 md:border-r lg:w-96 flex-shrink-0",
                  selectedId ? "hidden md:flex" : "flex"
                )}
              >
                <div className="shrink-0 space-y-3 px-4 pt-4 pb-3">
                  <h1 className="text-2xl font-bold text-foreground">Messages</h1>
                  {tabs}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ConversationList
                    conversations={conversations}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    isLoading={conversationsLoading}
                  />
                </div>
              </div>

              {/* Conversation (desktop) */}
              <div className="hidden min-w-0 flex-1 md:block">{thread}</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Inbox;
