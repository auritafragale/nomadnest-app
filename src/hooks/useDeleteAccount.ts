import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export const useDeleteAccount = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      // All data removal happens server-side in the delete-account function
      // using elevated privileges: rows that cascade from the auth user are
      // removed automatically, and the rest (notifications, preferences, push
      // subscriptions, favourites) are cleaned up explicitly there.
      // Deleting from the client is unreliable — most of these tables
      // intentionally have no delete permission for regular users, so the
      // requests silently removed nothing.
      const { error: deleteAuthError } = await supabase.functions.invoke("delete-account");
      if (deleteAuthError) throw deleteAuthError;
    },
    onSuccess: async () => {
      toast({
        title: "Account deleted",
        description: "Your account and all data have been removed.",
      });
      await supabase.auth.signOut();
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting account",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
