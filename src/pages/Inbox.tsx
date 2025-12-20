import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationParam = searchParams.get("conversation");
  const [selectedId, setSelectedId] = useState<string | null>(conversationParam);

  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(selectedId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();

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
      setSearchParams({ conversation: id });
    } else {
      setSearchParams({});
    }
  };

  // Mark messages as read when conversation is selected
  useEffect(() => {
    if (selectedId) {
      markAsRead.mutate(selectedId);
    }
  }, [selectedId]);

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
