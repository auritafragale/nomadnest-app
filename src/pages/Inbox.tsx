import { useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkAsRead,
} from "@/hooks/useConversations";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { cn } from "@/lib/utils";

const Inbox = () => {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationParam = searchParams.get("conversation");
  const [selectedId, setSelectedId] = useState<string | null>(conversationParam);

  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(selectedId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();
  const { unreadCount } = useUnreadMessages();
  const lastMarkedConversationRef = useRef<string | null>(null);

  const clearNotificationTray = () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_NOTIFICATIONS' });
    }
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    nav.clearAppBadge?.();
  };

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null;
  
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
        markAsRead.mutate(id);
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
      markAsRead.mutate(selectedId);
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
    if (selectedId) {
      sendMessage.mutate({ conversationId: selectedId, body });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-20">
        <div className="container max-w-6xl mx-auto px-4 py-6 h-[calc(100svh-9rem)] md:h-[calc(100svh-5rem)]">
          <Breadcrumbs />
          <h1 className="text-2xl font-bold text-foreground mb-6">Messages</h1>

          <div className="flex h-[calc(100%-4rem)] border border-border rounded-lg overflow-hidden bg-card">
            {/* Conversation List */}
            <div
              className={cn(
                "w-full md:w-80 lg:w-96 border-r border-border flex-shrink-0",
                selectedId ? "hidden md:block" : "block"
              )}
            >
              <ConversationList
                conversations={conversations}
                selectedId={selectedId}
                onSelect={handleSelect}
                isLoading={conversationsLoading}
              />
            </div>

            {/* Message Thread */}
            <div
              className={cn(
                "flex-1 min-w-0",
                selectedId ? "block" : "hidden md:block"
              )}
            >
              <MessageThread
                conversation={selectedConversation}
                messages={messages}
                isLoading={messagesLoading}
                onSend={handleSend}
                isSending={sendMessage.isPending}
                onBack={() => handleSelect(null)}
                otherUserRole={getOtherUserRole()}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Inbox;
