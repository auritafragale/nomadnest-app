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
  evidenceFiles?: File[];
}

const EVIDENCE_PATH_PREFIX = "report-evidence";

/**
 * Upload proof files into the member's own folder in the private
 * report-evidence bucket. Files are scoped to {user_id}/{report_id}/...
 */
const uploadEvidence = async (userId: string, reportId: string, files: File[]) => {
  const paths: string[] = [];
  for (const file of files) {
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const path = `${userId}/${reportId}/${crypto.randomUUID()}${ext}`;
    const { error } = await supabase.storage
      .from(EVIDENCE_PATH_PREFIX)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
};

export const useSubmitReport = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ targetType, targetId, reason, details, evidenceFiles }: ReportData) => {
      if (!user) throw new Error("Must be logged in to submit a report");
      if (!evidenceFiles || evidenceFiles.length === 0) {
        throw new Error("Please attach at least one proof file (image or PDF)");
      }

      // Insert the report first so we have an id for the evidence folder
      const { data: inserted, error } = await supabase
        .from("reports")
        .insert({
          reporter_user_id: user.id,
          target_type: targetType,
          target_id: targetId,
          reason,
          details: details || null,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Upload proof into the member's own folder, then store paths on the report
      let evidencePaths: string[] = [];
      try {
        evidencePaths = await uploadEvidence(user.id, inserted.id, evidenceFiles);
      } catch (e) {
        // Report was saved but evidence failed — still notify founders so it's visible
        console.error("Evidence upload failed", e);
      }

      if (evidencePaths.length > 0) {
        await supabase
          .from("reports")
          .update({ evidence_paths: evidencePaths })
          .eq("id", inserted.id);
      }

      // Give the founders an email heads-up so reports are never missed
      try {
        await supabase.functions.invoke("notify-new-report", {
          body: {
            targetType,
            targetId,
            reason,
            details: details || null,
            evidencePaths,
            reportId: inserted.id,
          },
        });
      } catch (e) {
        console.error("Could not alert the admin team about this report", e);
      }
    },
    onSuccess: () => {
      toast({
        title: "Report submitted",
        description:
          "Thank you for helping keep our community safe. We'll review your report shortly.",
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
