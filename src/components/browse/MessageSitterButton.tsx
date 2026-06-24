import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ButtonProps } from "@/components/ui/button";
import { MessageSquare, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStartConversation } from "@/hooks/useConversations";
import { useToast } from "@/hooks/use-toast";

interface MessageSitterButtonProps extends Omit<ButtonProps, "onClick"> {
  sitterUserId: string;
  label?: string;
}

const MessageSitterButton = ({
  sitterUserId,
  label = "Message",
  className,
  size,
  variant,
  style,
  ...rest
}: MessageSitterButtonProps) => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const startConversation = useStartConversation();
  const [loading, setLoading] = useState(false);

  // Only show to owner / both. Hide for sitters viewing other sitters.
  if (user && role === "sitter") return null;
  if (user && user.id === sitterUserId) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      navigate("/auth");
      return;
    }

    setLoading(true);
    try {
      const { conversationId } = await startConversation.mutateAsync({
        otherUserId: sitterUserId,
        conversationType: "direct",
      });
      navigate(`/inbox?conversation=${conversationId}`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to start conversation. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      style={style}
      onClick={handleClick}
      disabled={loading}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <MessageSquare className="w-4 h-4 mr-2" />
      )}
      {label}
    </Button>
  );
};

export default MessageSitterButton;
