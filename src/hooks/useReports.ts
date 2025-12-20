import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";

type ReportTargetType = Database["public"]["Enums"]["report_target_type"];

interface ReportData {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
}

export const useSubmitReport = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ targetType, targetId, reason, details }: ReportData) => {
      if (!user) throw new Error("Must be logged in to submit a report");

      const { error } = await supabase.from("reports").insert({
        reporter_user_id: user.id,
        target_type: targetType,
        target_id: targetId,
        reason,
        details: details || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Report submitted",
        description: "Thank you for helping keep our community safe. We'll review your report shortly.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit report",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });
};
