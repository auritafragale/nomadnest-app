import { useState } from "react";
import { Loader2 } from "lucide-react";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import { Textarea } from "@/components/ui/textarea";
import { nnButton } from "@/components/nn/ui";
import { useSubmitReport } from "@/hooks/useReports";
import { REVIEW_REPORT_REASONS } from "@/lib/reviews";
import { cn } from "@/lib/utils";

/** Report a review (design: ReviewsPhone, "Report a review"). */
const ReviewReportDialog = ({
  reviewId,
  reviewerName,
  open,
  onOpenChange,
}: {
  reviewId: string;
  reviewerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [reason, setReason] = useState(REVIEW_REPORT_REASONS[0].value);
  const [details, setDetails] = useState("");
  const submit = useSubmitReport();

  const send = () => {
    submit.mutate(
      {
        targetType: "review",
        targetId: reviewId,
        reason,
        details: details.trim() || undefined,
        successToast: "Thanks. Our team will check this review.",
      },
      { onSettled: () => onOpenChange(false) },
    );
  };

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Report this review" description={`Report ${reviewerName}'s review to the NomadNest team.`}>
      <div className="flex flex-col gap-3">
        <span id="review-report-reason" className="text-[15px] font-bold">
          What’s wrong with it?
        </span>
        <div role="radiogroup" aria-labelledby="review-report-reason" className="flex flex-col gap-2">
          {REVIEW_REPORT_REASONS.map((r) => {
            const on = reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(r.value)}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-[14px] px-3.5 text-left text-[15px]",
                  on ? "border-2 border-foreground bg-muted font-bold" : "border-[1.5px] border-[var(--nn-border)] font-semibold",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("h-5 w-5 shrink-0 rounded-full", on ? "border-[6px] border-foreground" : "border-2 border-muted-foreground")}
                />
                {r.label}
              </button>
            );
          })}
        </div>
        <label htmlFor="review-report-details" className="sr-only">
          Anything else we should know? (optional)
        </label>
        <Textarea
          id="review-report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
          placeholder="Anything else we should know? (optional)"
          rows={3}
          className="text-[15px]"
        />
        <p className="text-[13px] leading-normal text-muted-foreground">
          The review stays up while our team checks it. Nobody is told who reported it.
        </p>
        <button type="button" onClick={send} disabled={submit.isPending} className={nnButton("primary", "h-[52px] rounded-[14px] text-base")}>
          {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Send report
        </button>
        <button type="button" onClick={() => onOpenChange(false)} className={nnButton("secondary", "h-[52px] rounded-[14px] text-base")}>
          Cancel
        </button>
      </div>
    </ResponsiveSheet>
  );
};

export default ReviewReportDialog;
