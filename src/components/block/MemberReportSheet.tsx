import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import { Textarea } from "@/components/ui/textarea";
import { nnButton } from "@/components/nn/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSubmitReport } from "@/hooks/useReports";
import { findConversationWith } from "@/hooks/useBlocks";
import { cn } from "@/lib/utils";

const MEMBER_REPORT_REASONS = [
  { value: "felt_unsafe", label: "Made me feel unsafe" },
  { value: "rude_or_hateful_messages", label: "Rude or hateful messages" },
  { value: "asked_for_money", label: "Asked for money or payment outside NomadNest" },
  { value: "fake_or_scam", label: "Fake profile or scam" },
  { value: "other", label: "Something else" },
] as const;

/**
 * Report a member with your chat attached (design: BlockPhone, "Report after
 * blocking"). One row in reports; the team can open that chat. Also used by
 * the money warning in a chat, with "Asked for money…" chosen.
 */
const MemberReportSheet = ({
  otherId,
  otherName,
  open,
  onOpenChange,
  title,
  conversationId,
  initialReason = "felt_unsafe",
  skipLabel = "Skip",
}: {
  otherId: string;
  otherName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  conversationId?: string | null;
  initialReason?: (typeof MEMBER_REPORT_REASONS)[number]["value"];
  skipLabel?: string;
}) => {
  const { user } = useAuth();
  const [reason, setReason] = useState<string>(initialReason);
  const [details, setDetails] = useState("");
  const submit = useSubmitReport();

  useEffect(() => {
    if (open) {
      setReason(initialReason);
      setDetails("");
    }
  }, [open, initialReason]);

  const send = async () => {
    const conv = conversationId ?? (user ? await findConversationWith(user.id, otherId) : null);
    submit.mutate(
      {
        targetType: "user",
        targetId: otherId,
        reason,
        details: details.trim() || undefined,
        conversationId: conv,
        successToast: "Thanks. Our team will check what happened.",
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={title} description={`Tell the NomadNest team what happened with ${otherName}.`}>
      <div className="flex flex-col gap-3">
        <span id="member-report-reason" className="text-[16px] font-bold">
          Tell us what happened
        </span>
        <div role="radiogroup" aria-labelledby="member-report-reason" className="flex flex-col gap-2">
          {MEMBER_REPORT_REASONS.map((r) => {
            const on = reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(r.value)}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-[14px] px-3.5 py-2 text-left text-[15px]",
                  on ? "border-2 border-foreground bg-muted font-bold" : "border-[1.5px] border-[var(--nn-border)] font-semibold",
                )}
              >
                <span aria-hidden="true" className={cn("h-5 w-5 shrink-0 rounded-full", on ? "border-[6px] border-foreground" : "border-2 border-muted-foreground")} />
                {r.label}
              </button>
            );
          })}
        </div>
        <label htmlFor="member-report-details" className="sr-only">
          Anything else we should know? (optional)
        </label>
        <Textarea
          id="member-report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
          placeholder="Anything else we should know? (optional)"
          rows={3}
          className="text-[15px]"
        />
        <p className="text-[13px] leading-normal text-muted-foreground">
          Our team reads your report and your chat with {otherName} to check what happened, and may email you. {otherName} isn’t told who reported them.
        </p>
        <button type="button" onClick={() => void send()} disabled={submit.isPending} className={nnButton("primary", "h-[52px] rounded-[14px] text-base")}>
          {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Send report
        </button>
        <button type="button" onClick={() => onOpenChange(false)} className={nnButton("secondary", "h-[52px] rounded-[14px] text-base")}>
          {skipLabel}
        </button>
      </div>
    </ResponsiveSheet>
  );
};

export default MemberReportSheet;
