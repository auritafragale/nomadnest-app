import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Flag, Loader2, Paperclip, X } from "lucide-react";
import { useSubmitReport } from "@/hooks/useReports";
import { useAuth } from "@/contexts/AuthContext";
import { Database } from "@/integrations/supabase/types";

type ReportTargetType = Database["public"]["Enums"]["report_target_type"];

interface ReportDialogProps {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
  trigger?: React.ReactNode;
}

const REPORT_REASONS: Record<ReportTargetType, { value: string; label: string }[]> = {
  user: [
    { value: "fake_profile", label: "Fake or misleading profile" },
    { value: "inappropriate_behavior", label: "Inappropriate behavior" },
    { value: "harassment", label: "Harassment or abuse" },
    { value: "spam", label: "Spam or scam" },
    { value: "other", label: "Other" },
  ],
  listing: [
    { value: "misleading_info", label: "Misleading information" },
    { value: "inappropriate_content", label: "Inappropriate content" },
    { value: "suspected_scam", label: "Suspected scam" },
    { value: "duplicate", label: "Duplicate listing" },
    { value: "other", label: "Other" },
  ],
  message: [
    { value: "harassment", label: "Harassment or abuse" },
    { value: "spam", label: "Spam or scam" },
    { value: "inappropriate_content", label: "Inappropriate content" },
    { value: "threats", label: "Threats or violence" },
    { value: "other", label: "Other" },
  ],
};

const TARGET_LABELS: Record<ReportTargetType, string> = {
  user: "user",
  listing: "listing",
  message: "message",
};

const ACCEPTED = "image/*,application/pdf";
const MAX_FILES = 6;

const ReportDialog = ({
  targetType,
  targetId,
  targetLabel,
  trigger,
}: ReportDialogProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const submitReport = useSubmitReport();

  const reasons = REPORT_REASONS[targetType];
  const label = targetLabel || TARGET_LABELS[targetType];

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...files, ...Array.from(incoming)].slice(0, MAX_FILES);
    setFiles(next);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!reason || files.length === 0) return;

    submitReport.mutate(
      {
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
        evidenceFiles: files,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setReason("");
          setDetails("");
          setFiles([]);
        },
      }
    );
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2">
            <Flag className="w-4 h-4" />
            Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report {label}</DialogTitle>
          <DialogDescription>
            Help us keep the community safe. Your report will be reviewed by our team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label>Why are you reporting this {label}?</Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              {reasons.map((r) => (
                <div key={r.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={r.value} id={r.value} />
                  <Label htmlFor={r.value} className="font-normal cursor-pointer">
                    {r.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">Additional details (optional)</Label>
            <Textarea
              id="details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide any additional context that might help us review this report..."
              rows={3}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {details.length}/1000
            </p>
          </div>

          <div className="space-y-2">
            <Label>
              Proof (required) <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Attach at least one screenshot or document. Images and PDFs up to 15 MB each.
            </p>

            <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Add file</span>
              <input
                type="file"
                accept={ACCEPTED}
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>

            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5"
                  >
                    <span className="text-xs truncate min-w-0">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={`Remove ${f.name}`}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason || files.length === 0 || submitReport.isPending}
          >
            {submitReport.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
