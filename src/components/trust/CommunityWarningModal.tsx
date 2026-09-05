import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface CommunityWarningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Human labels of the active flag categories. */
  labels: string[];
  /** "listing" = a nomad about to apply, "nomad" = a pet parent about to accept. */
  audience: "listing" | "nomad";
  continueLabel: string;
  onContinue: () => void;
}

/**
 * Cautionary (never punitive) notice shown only at strike three, right before
 * someone commits — amber tones, supportive copy, easy exit.
 */
const CommunityWarningModal = ({
  open,
  onOpenChange,
  labels,
  audience,
  continueLabel,
  onContinue,
}: CommunityWarningModalProps) => {
  const issues = labels.join(" / ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-amber-400 bg-amber-50/90 dark:bg-amber-950/60">
        <DialogHeader>
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-amber-100 dark:bg-amber-900/60 border border-amber-400 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <DialogTitle className="text-left text-amber-900 dark:text-amber-100">
            ⚠️ Community Information Notice
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
          {audience === "listing" ? (
            <>
              To help you plan your journey, please note that multiple recent sitters have
              privately shared feedback regarding this listing's:{" "}
              <em className="font-semibold not-italic">{issues}</em>.
              <br />
              <br />
              Every home is unique, and we encourage you to discuss these topics directly with
              the host during your initial chat to ensure expectations are perfectly aligned for
              both parties.
            </>
          ) : (
            <>
              To help you plan your upcoming sit, please note that multiple recent pet parents
              have privately shared feedback regarding this nomad's:{" "}
              <em className="font-semibold not-italic">{issues}</em>.
              <br />
              <br />
              Every sitting style is unique. We highly encourage you to discuss your specific
              home rules and pet care schedules directly with the nomad during your initial chat
              to ensure expectations are perfectly aligned.
            </>
          )}
        </p>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="sm:mr-auto">
            Go Back
          </Button>
          <Button onClick={onContinue}>{continueLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CommunityWarningModal;
