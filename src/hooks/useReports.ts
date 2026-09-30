import { photoWithoutMetadata } from "@/lib/imageResize";
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
    // Photos are re-encoded on the device (no location or other metadata); other files as they are.
    const clean = await photoWithoutMetadata(file);
    const path = `${userId}/${reportId}/${crypto.randomUUID()}.${clean.ext}`;
    const { error } = await supabase.storage
      .from(EVIDENCE_PATH_PREFIX)
      .upload(path, clean.body, { upsert: false, contentType: clean.contentType });
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
      if ((!evidenceFiles || evidenceFiles.length === 0) && targetType !== "sit_story") {
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
        evidencePaths = evidenceFiles && evidenceFiles.length > 0 ? await uploadEvidence(user.id, inserted.id, evidenceFiles) : [];
      } catch (e) {
        // Report was saved but evidence failed — still notify founders so it's visible
        console.error("Evidence upload failed", e);
      }

      // Members can't update reports: a checked function records the files
      // (own folder, own report, only while it's pending).
      if (evidencePaths.length > 0) {
        const { error: attachError } = await supabase.rpc("attach_report_evidence", {
          p_report_id: inserted.id,
          p_paths: evidencePaths,
        });
        if (attachError) {
          console.error("Could not record the proof files", attachError.code);
          evidencePaths = [];
        }
      }

      // Give the founders an email heads-up so reports are never missed
      try {
        await supabase.functions.invoke("notify-new-report", {
          // The function reads everything else from the saved report.
          body: { reportId: inserted.id },
        });
      } catch (e) {
        console.error("Could not alert the admin team about this report", e);
      }

      return {
        reportId: inserted.id,
        evidenceUploadFailed: evidencePaths.length < (evidenceFiles?.length ?? 0),
      };
    },
    onSuccess: (result) => {
      if (result?.evidenceUploadFailed) {
        toast({
          title: "Report submitted, but proof upload failed",
          description: `We couldn't upload your proof files — please contact support and reference report ID ${result.reportId} to add them.`,
          variant: "destructive",
        });
        return;
      }
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
