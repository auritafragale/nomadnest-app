import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import { nnButton, shortRange } from "@/components/nn/ui";
import MemberReportSheet from "@/components/block/MemberReportSheet";
import { invalidateAfterBlock, useBlockMember, useSitWith } from "@/hooks/useBlocks";
import { createBlockFlow } from "@/lib/blockFlow";
import { cn } from "@/lib/utils";

const STRIKE = "Cancelling within 2 weeks of the start adds a strike to your reliability record, the same as any cancellation.";

/**
 * Block a member (design: BlockPhone). The confirm sheet changes when there
 * is a sit between you: one happening now keeps its chat open until it ends;
 * a confirmed one that hasn't started is cancelled through the usual rules.
 * Ticking "Also report" opens the report sheet straight after; the lists
 * refresh and onBlocked runs only once that sheet is closed or sent, so the
 * screen doesn't move away first. onFinished: the whole flow is over (the
 * parent may unmount this).
 */
const BlockMemberSheet = ({
  otherId,
  otherName,
  open,
  onOpenChange,
  conversationId,
  onBlocked,
  onFinished,
}: {
  otherId: string;
  otherName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string | null;
  onBlocked?: () => void;
  onFinished?: () => void;
}) => {
  const n = otherName || "this member";
  const [alsoReport, setAlsoReport] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { data: sit } = useSitWith(otherId, open);
  const block = useBlockMember({ refreshOnSuccess: false });
  const queryClient = useQueryClient();

  // One flow per opening: block → (report) → refresh and onBlocked.
  const hooks = useRef({ onBlocked, onFinished });
  hooks.current = { onBlocked, onFinished };
  const makeFlow = () =>
    createBlockFlow({
      refresh: () => invalidateAfterBlock(queryClient),
      onBlocked: () => hooks.current.onBlocked?.(),
      openReport: () => setReportOpen(true),
      onFinished: () => hooks.current.onFinished?.(),
    });
  const flow = useRef(makeFlow());
  useEffect(() => {
    if (open && !flow.current.waitingForReport) flow.current = makeFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const blocked = useRef(false);
  useEffect(() => {
    if (open) blocked.current = false;
  }, [open]);

  // Closing the block sheet without blocking ends the flow.
  const onMainOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o && !blocked.current) flow.current.cancelled();
  };
  const onReportOpenChange = (o: boolean) => {
    setReportOpen(o);
    if (!o) flow.current.reportClosed();
  };

  const live = sit?.status === "in_progress";
  const confirmed = sit?.status === "confirmed";
  const dates = sit?.start && sit?.end ? shortRange(sit.start, sit.end) : null;

  let title = `Block ${n}?`;
  let sitTitle = "";
  let sitBody = "";
  let blockLabel = `Block ${n}`;
  let keepLabel = "Cancel";
  let points: string[];
  if (live) {
    sitTitle = `Your sit together is happening now${dates ? ` (${dates})` : ""}`;
    sitBody = "Your chat stays open until the sit ends, so you can still sort out keys and pet care. Everything else is blocked straight away.";
    points = [
      `${n} can’t apply to your home or invite you. Once the sit ends, you can’t message each other.`,
      "You won’t see each other in Browse, Nomads Near Me or City Chats.",
      `${n} won’t be told.`,
    ];
  } else if (confirmed) {
    title = `Block ${n} and cancel your sit?`;
    sitTitle = `You have a confirmed sit with ${n}${dates ? `, ${dates}` : ""}`;
    sitBody = `Blocking ${n} cancels this sit.`;
    points = sit?.iAmOwner
      ? [
          "Your dates open again straight away, so you can find another Nomad.",
          `${n} is told the sit was cancelled, but not that you blocked them.`,
          STRIKE,
          "You won’t see each other anywhere on NomadNest.",
        ]
      : [
          `${n} is told the sit was cancelled so they can find another Nomad, but not that you blocked them.`,
          `${n}’s dates open again for other Nomads.`,
          STRIKE,
          "You won’t see each other anywhere on NomadNest.",
        ];
    blockLabel = `Cancel the sit and block ${n}`;
    keepLabel = "Keep the sit";
  } else {
    points = [
      `You won’t be able to message each other, and ${n} can’t apply to your home or invite you.`,
      "You won’t see each other in Browse, Nomads Near Me or City Chats.",
      `${n} won’t be told.`,
      "You can unblock any time in Settings, Privacy.",
    ];
  }

  const doBlock = () => {
    block.mutate(otherId, {
      onSuccess: () => {
        blocked.current = true;
        onOpenChange(false);
        toast.success(confirmed ? `${n} is blocked and the sit is cancelled.` : `${n} is blocked.`);
        flow.current.blocked(alsoReport);
        setAlsoReport(false);
      },
      onError: () => toast.error("That didn’t work. Please try again."),
    });
  };

  return (
    <>
      <ResponsiveSheet open={open} onOpenChange={onMainOpenChange} title={title} description={`Block ${n} on NomadNest.`}>
        <div className="flex flex-col gap-4">
          {sitTitle && (
            <div className="flex flex-col gap-1 rounded-[18px] bg-[var(--nn-tip-bg)] p-4 text-[var(--nn-tip-text)]">
              <span className="text-[15px] font-bold">{sitTitle}</span>
              <span className="text-sm leading-normal">{sitBody}</span>
            </div>
          )}
          <ul className="flex flex-col gap-2.5">
            {points.map((p) => (
              <li key={p} className="flex gap-2.5 text-[15px] leading-normal">
                <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border-[1.5px] border-[var(--nn-border)] px-3.5 py-2">
            <input
              type="checkbox"
              checked={alsoReport}
              onChange={(e) => setAlsoReport(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                alsoReport ? "border-[var(--nn-accent)] bg-[var(--nn-accent)] text-primary-foreground" : "border-muted-foreground",
              )}
            >
              {alsoReport && <Check className="h-4 w-4" />}
            </span>
            <span className="text-[15px] font-semibold">Also report {n} to the NomadNest team</span>
          </label>
          <button type="button" onClick={doBlock} disabled={block.isPending} className={nnButton("primary", "h-[52px] rounded-[14px] text-base")}>
            {block.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {blockLabel}
          </button>
          <button type="button" onClick={() => onMainOpenChange(false)} className={nnButton("secondary", "h-[52px] rounded-[14px] text-base")}>
            {keepLabel}
          </button>
          <Link to="/contact" className="min-h-11 self-center py-2 text-sm font-bold text-[var(--nn-accent-dark)] underline underline-offset-2">
            Feel unsafe? Contact us now
          </Link>
        </div>
      </ResponsiveSheet>
      <MemberReportSheet
        otherId={otherId}
        otherName={n}
        open={reportOpen}
        onOpenChange={onReportOpenChange}
        title={`${n} is blocked`}
        conversationId={conversationId}
      />
    </>
  );
};

export default BlockMemberSheet;
