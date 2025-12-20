import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bell, BellOff, BellRing, Smartphone, Send } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PushNotificationSettings = () => {
  const { user } = useAuth();
  const [isSendingTest, setIsSendingTest] = useState(false);
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const sendTestNotification = async () => {
    if (!user) return;
    
    setIsSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          user_id: user.id,
          payload: {
            title: "🎉 Test Notification",
            body: "Push notifications are working! You'll receive alerts for messages, applications, and more.",
            url: "/settings",
            tag: "test",
          },
        },
      });

      if (error) throw error;
      
      toast.success("Test notification sent! Check your device.");
    } catch (error) {
      console.error("Failed to send test notification:", error);
      toast.error("Failed to send test notification");
    } finally {
      setIsSendingTest(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Smartphone className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Push Notifications</p>
            <p className="text-sm text-muted-foreground">
              Not supported in your browser
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-muted-foreground">
          Unavailable
        </Badge>
      </div>
    );
  }

  const getStatusBadge = () => {
    if (isLoading) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading
        </Badge>
      );
    }

    if (permission === "denied") {
      return (
        <Badge variant="destructive" className="gap-1">
          <BellOff className="w-3 h-3" />
          Blocked
        </Badge>
      );
    }

    if (isSubscribed) {
      return (
        <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
          <BellRing className="w-3 h-3" />
          Enabled
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <BellOff className="w-3 h-3" />
        Disabled
      </Badge>
    );
  };

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Smartphone className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Push Notifications</p>
            <p className="text-sm text-muted-foreground">
              {isSubscribed
                ? "Receive instant notifications on this device"
                : "Get notified instantly when something happens"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge()}
          <Button
            variant={isSubscribed ? "outline" : "default"}
            size="sm"
            onClick={handleToggle}
            disabled={isLoading || permission === "denied"}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSubscribed ? (
              <>
                <BellOff className="w-4 h-4 mr-2" />
                Disable
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 mr-2" />
                Enable
              </>
            )}
          </Button>
        </div>
      </div>

      {permission === "denied" && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          <p className="text-sm text-destructive">
            Push notifications are blocked in your browser. To enable them:
          </p>
          <ol className="text-sm text-destructive mt-2 list-decimal list-inside space-y-1">
            <li>Click the lock icon in your browser's address bar</li>
            <li>Find "Notifications" in the permissions list</li>
            <li>Change it from "Block" to "Allow"</li>
            <li>Refresh this page</li>
          </ol>
        </div>
      )}

      {isSubscribed && (
        <div className="space-y-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm text-muted-foreground">
              You'll receive push notifications for new messages, application updates, 
              and other important events even when this tab is closed.
            </p>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={sendTestNotification}
            disabled={isSendingTest}
            className="w-full"
          >
            {isSendingTest ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send Test Notification
          </Button>
        </div>
      )}
    </div>
  );
};

export default PushNotificationSettings;
