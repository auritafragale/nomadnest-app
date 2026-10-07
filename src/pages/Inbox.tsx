import { useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import Navbar from "@/components/layout/Navbar";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import SitPanel from "@/components/inbox/SitPanel";
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkAsRead,
  threadConversationId,
} from "@/hooks/useConversations";
import CityChatsSection from "@/components/city-chat/CityChatsSection";
import { RoleTheme } from "@/components/nn/ui";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { useHideBottomNav } from "@/lib/bottomNav";

const Inbox = () => {
  const { user, loading, role } = useAuth();
  const { activeRole } = useActiveRole();
  const { toast } = useToast();

  // City Chats are for Nomads (as before).
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

  const {
    data: conversations = [],
    isLoading: conversationsLoading,
    isError: conversationsError,
    refetch: refetchConversations,
  } = useConversations();
  const selectedConversation =
    conversations.find(
      (conversation) => conversation.id === selectedId || conversation.conversation_ids.includes(selectedId || ""),
    ) || null;
  const selectedConversationIds = selectedConversation?.conversation_ids ?? [];
  const { data: messages = [], isLoading: messagesLoading } = useMessages(selectedConversationIds);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();
  const lastMarkedConversationRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  const mobileThreadOpen = isMobile && activeTab === "messages" && !!selectedId;
  const viewport = useVisualViewport(mobileThreadOpen);
  // The open chat owns the phone screen: no bottom bar behind it, so the chat
  // can sit below the menus and sheets it opens (z-50).
  useHideBottomNav(mobileThreadOpen);

  // The full-screen thread owns the screen: no page scrolling behind it.
  useEffect(() => {
    if (!mobileThreadOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileThreadOpen]);

  // Pushes for this chat leave the phone's notification tray. (The app
  // icon badge follows the counts in <UnreadSync />.)
  const clearNotificationTray = () => {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_NOTIFICATIONS" });
    }
  };

  // Whether the other member is a Nomad or a Pet Parent in this chat.
  const getOtherUserRole = (): "sitter" | "owner" => {
    if (!selectedConversation || !user) return "sitter";
    return selectedConversation.owner_user_id === user.id ? "sitter" : "owner";
  };

  // Update selected ID when URL param changes (deep links: ?conversation=).
  useEffect(() => {
    if (conversationParam && conversationParam !== selectedId) {
      setSelectedId(conversationParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationParam]);

  const markOpened = (id: string) => {
    if (lastMarkedConversationRef.current === id) return;
    const ids = conversations.find(
      (conversation) => conversation.id === id || conversation.conversation_ids.includes(id),
    )?.conversation_ids;
    // A deep link before the list has loaded: the effect below tries again
    // once it has.
    if (!ids) return;
    lastMarkedConversationRef.current = id;
    markAsRead.mutate(ids);
    clearNotificationTray();
  };

  const handleSelect = (id: string | null) => {
    setSelectedId(id);
    if (id) {
      markOpened(id);
      setSearchParams({ conversation: id });
    } else {
      lastMarkedConversationRef.current = null;
      setSearchParams({});
    }
  };

  // Mark as read when a chat opens through the URL (and once the list loads).
  useEffect(() => {
    if (selectedId) markOpened(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, conversations.length]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleSend = (body: string) => {
    if (selectedConversation) {
      sendMessage.mutate(
        { conversationId: threadConversationId(selectedConversation), body },
        {
          onError: () => {
            toast({
              title: "Message not sent",
              description: "Something went wrong. Please try again.",
              variant: "destructive",
            });
          },
        },
      );
    }
  };

  const tabs = canUseCityChats && (
    <div role="tablist" aria-label="Chat type" className="grid grid-cols-2 rounded-full bg-muted p-1">
      {([
        { id: "messages", label: "Chats" },
        { id: "city-chats", label: "City Chats" },
      ] as const).map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activeTab === id}
          onClick={() => setActiveTab(id)}
          className={cn(
            "h-11 rounded-full text-sm font-bold transition-colors",
            activeTab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
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

  const theme = activeRole === "owner" ? "owner" : "sitter";

  // Phone, chat open: the thread takes the whole visible screen (above the
  // top and bottom bars), sized to the visual viewport so the message box
  // sits just above the keyboard.
  if (mobileThreadOpen) {
    return (
      <RoleTheme role={theme}>
        <div
          className="fixed inset-x-0 top-0 z-40 flex flex-col bg-background"
          style={viewport ? { height: viewport.height, transform: `translateY(${viewport.offsetTop}px)` } : { height: "100dvh" }}
        >
          {thread}
        </div>
      </RoleTheme>
    );
  }

  return (
    <RoleTheme role={theme} className="flex h-[100svh] flex-col overflow-hidden">
      <Navbar wide />

      <main className="min-h-0 flex-1 pb-16 pt-16 md:pb-0">
        <div className="mx-auto h-full max-w-[1400px] md:px-4 md:py-4 lg:px-6">
          <div className="flex h-full min-h-0 overflow-hidden bg-background md:rounded-[24px] md:border md:border-[var(--nn-border)]">
            {/* List */}
            <div
              className={cn(
                "flex w-full shrink-0 flex-col md:w-[320px] md:border-r md:border-[var(--nn-border)] lg:w-[340px]",
                selectedId && activeTab === "messages" ? "hidden md:flex" : "flex",
              )}
            >
              <div className="shrink-0 space-y-3 px-5 pb-3 pt-4 md:px-3">
                <h1 className="font-display text-[32px] font-normal leading-tight">Messages</h1>
                {tabs}
              </div>
              {activeTab === "city-chats" ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 md:px-3">
                  <CityChatsSection />
                </div>
              ) : (
                <ConversationList
                  conversations={conversations}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  isLoading={conversationsLoading}
                  isError={conversationsError}
                  onRetry={() => refetchConversations()}
                />
              )}
            </div>

            {/* Thread (tablet and desktop) */}
            <div className="hidden min-w-0 flex-1 md:block">
              {activeTab === "city-chats" ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <p className="font-display text-xl">Choose a City Chat</p>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">Open a city on the left to read and join in.</p>
                </div>
              ) : (
                thread
              )}
            </div>

            {/* Sit panel (desktop) */}
            {activeTab === "messages" && selectedConversation && (
              <SitPanel conversation={selectedConversation} messages={messages} />
            )}
          </div>
        </div>
      </main>
    </RoleTheme>
  );
};

export default Inbox;
