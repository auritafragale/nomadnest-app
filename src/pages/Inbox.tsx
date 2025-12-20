import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkAsRead,
} from "@/hooks/useConversations";
import { cn } from "@/lib/utils";

const Inbox = () => {
  const { user, loading } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(selectedId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null;

  // Mark messages as read when conversation is selected
  useEffect(() => {
    if (selectedId && selectedConversation?.unread_count) {
      markAsRead.mutate(selectedId);
    }
  }, [selectedId, selectedConversation?.unread_count]);

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
        <div className="container max-w-6xl mx-auto px-4 py-6 h-[calc(100vh-5rem)]">
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
                onSelect={setSelectedId}
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
                onBack={() => setSelectedId(null)}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Inbox;
