import { useMutation } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
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
      if (deleteAuthError) {
        // Show the function's own message (e.g. "nothing was deleted, try again").
        const detail =
          deleteAuthError instanceof FunctionsHttpError
            ? await deleteAuthError.context.json().catch(() => null)
            : null;
        throw new Error(detail?.error || "We couldn't delete your account just now. Please try again.");
      }
    },
    onSuccess: async () => {
      toast({
        title: "Account deleted",
        description: "Your account and your data have been deleted.",
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
