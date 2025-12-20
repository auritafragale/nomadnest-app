import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export const useDeleteAccount = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      // Delete user data in order (respecting foreign key constraints)
      // 1. Delete messages
      await supabase.from("messages").delete().eq("sender_user_id", user.id);

      // 2. Delete conversations where user is owner or sitter
      await supabase.from("conversations").delete().eq("owner_user_id", user.id);
      await supabase.from("conversations").delete().eq("sitter_user_id", user.id);

      // 3. Delete applications
      await supabase.from("applications").delete().eq("sitter_user_id", user.id);

      // 4. Delete favorites
      await supabase.from("favorites").delete().eq("user_id", user.id);

      // 5. Delete reviews (as reviewer)
      await supabase.from("reviews").delete().eq("reviewer_user_id", user.id);

      // 6. Delete sits
      await supabase.from("sits").delete().eq("owner_user_id", user.id);
      await supabase.from("sits").delete().eq("sitter_user_id", user.id);

      // 7. Delete sitter invites
      await supabase.from("sitter_invites").delete().eq("owner_user_id", user.id);
      await supabase.from("sitter_invites").delete().eq("sitter_user_id", user.id);

      // 8. Delete notifications
      await supabase.from("notifications").delete().eq("user_id", user.id);

      // 9. Delete notification preferences
      await supabase.from("notification_preferences").delete().eq("user_id", user.id);

      // 10. Delete reports
      await supabase.from("reports").delete().eq("reporter_user_id", user.id);

      // 11. Delete listings (cascades to pets, sit_dates)
      await supabase.from("listings").delete().eq("owner_user_id", user.id);

      // 12. Delete profiles
      await supabase.from("sitter_profiles").delete().eq("user_id", user.id);
      await supabase.from("owner_profiles").delete().eq("user_id", user.id);
      await supabase.from("profiles").delete().eq("id", user.id);

      // 13. Delete user role
      await supabase.from("user_roles").delete().eq("user_id", user.id);

      // Sign out
      await signOut();
    },
    onSuccess: () => {
      toast({
        title: "Account deleted",
        description: "Your account and all data have been removed.",
      });
      navigate("/");
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
