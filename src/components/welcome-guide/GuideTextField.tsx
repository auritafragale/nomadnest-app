import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface GuideTextFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** When set, shows a "Not applicable" option labelled like "No alarm". */
  naLabel?: string;
  isNa?: boolean;
  onNaChange?: (na: boolean) => void;
  /** When set, shows "Polish with AI" for this field. */
  onPolish?: (text: string) => Promise<string>;
  rows?: number;
}

/**
 * One guide field: textarea, optional "Not applicable", optional AI polish
 * with a before/after the owner accepts or rejects.
 */
export const GuideTextField = ({
  id,
  label,
  placeholder,
  value,
  onChange,
  required,
  naLabel,
  isNa = false,
  onNaChange,
  onPolish,
  rows = 3,
}: GuideTextFieldProps) => {
  const [polishing, setPolishing] = useState(false);
  const [polished, setPolished] = useState<string | null>(null);

  const runPolish = async () => {
    if (!onPolish || !value.trim()) return;
    setPolishing(true);
    try {
      setPolished(await onPolish(value));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't polish that right now.");
    } finally {
      setPolishing(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
          {required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}
        </Label>
        {onPolish && !isNa && value.trim().length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-primary"
            onClick={runPolish}
            disabled={polishing}
          >
            {polishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
            {polishing ? "Polishing…" : "Polish with AI"}
          </Button>
        )}
      </div>

      {isNa ? (
        <p className="rounded-xl border border-dashed bg-muted/40 px-3 py-3 text-sm text-muted-foreground">{naLabel}</p>
      ) : (
        <Textarea
          id={id}
          value={value}
          placeholder={placeholder}
          rows={rows}
          aria-required={required}
          onChange={(e) => onChange(e.target.value)}
          readOnly={polishing}
          className="rounded-xl text-base leading-relaxed sm:text-sm"
        />
      )}

      {naLabel && onNaChange && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={isNa} onCheckedChange={(c) => onNaChange(c === true)} />
          Not applicable ({naLabel})
        </label>
      )}

      <Dialog open={polished !== null} onOpenChange={(open) => !open && setPolished(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Polished version of "{label}"</DialogTitle>
            <DialogDescription>Nothing new is added. Keep whichever you prefer.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Before</p>
              <p className="whitespace-pre-line rounded-xl border bg-muted/40 p-3 text-sm">{value}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">After</p>
              <p className="whitespace-pre-line rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">{polished}</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPolished(null)}>
              Keep mine
            </Button>
            <Button
              onClick={() => {
                if (polished) onChange(polished);
                setPolished(null);
              }}
            >
              Use polished version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
