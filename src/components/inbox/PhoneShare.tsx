import { Link } from "react-router-dom";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import { nnButton } from "@/components/nn/ui";
import type { PhoneShareState } from "@/hooks/usePhoneShares";
import type { PhoneShareAction } from "@/lib/phoneShare";
import { telHref, whatsAppHref } from "@/lib/phoneShare";
import { cn } from "@/lib/utils";

const NOTE = "self-center max-w-[92%] rounded-xl bg-muted px-3 py-2 text-center text-[13px] leading-snug text-muted-foreground";
const CARD = "w-full max-w-[420px] rounded-[20px] border border-[var(--nn-border)] bg-card p-4";

/**
 * A phone-share marker in the chat. The marker never holds the number: the
 * card shows it only when it is the latest share and is still active.
 */
export const PhoneShareMessage = ({
  action,
  isOwn,
  isLatest,
  otherName,
  state,
  onStop,
  stopping,
}: {
  action: PhoneShareAction;
  isOwn: boolean;
  /** The newest share marker from this sender. */
  isLatest: boolean;
  otherName: string;
  state: PhoneShareState | null;
  onStop: () => void;
  stopping: boolean;
}) => {
  if (action === "stopped") {
    return <p role="note" className={NOTE}>{isOwn ? "You stopped sharing your number." : `${otherName} stopped sharing their number.`}</p>;
  }
  if (action === "ended") {
    return (
      <p role="note" className={NOTE}>
        {isOwn
          ? "The sit was cancelled, so your number is no longer shared."
          : `The sit was cancelled, so ${otherName}'s number is no longer shared.`}
      </p>
    );
  }

  // Shared.
  if (isOwn) {
    if (!isLatest || !state?.i_am_sharing) return <p role="note" className={NOTE}>You shared your number with {otherName}.</p>;
    return (
      <section aria-label="You shared your number" className={cn(CARD, "self-end")}>
        <p className="text-[15px] font-bold">📞 You shared your number with {otherName}</p>
        {state.my_number && <p className="mt-1 text-lg font-bold tracking-wide">{state.my_number}</p>}
        <p className="mt-1 text-sm text-muted-foreground">Only {otherName} can see this.</p>
        <button type="button" onClick={onStop} disabled={stopping} className={nnButton("secondary", "mt-3")}>
          {stopping && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Stop sharing
        </button>
      </section>
    );
  }
  if (!isLatest || !state?.they_are_sharing || !state.their_number) {
    return <p role="note" className={NOTE}>{otherName} shared their number with you.</p>;
  }
  const number = state.their_number;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(number);
      toast.success("Number copied.");
    } catch {
      toast.error("Couldn't copy. Press and hold the number to copy it.");
    }
  };
  return (
    <section aria-label={`${otherName} shared their number`} className={cn(CARD, "self-start")}>
      <p className="text-[15px] font-bold">📞 {otherName} shared their number with you</p>
      <p className="mt-1 select-all text-lg font-bold tracking-wide">{number}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={telHref(number)} className={nnButton("primary")}>Call</a>
        <a href={whatsAppHref(number)} target="_blank" rel="noopener noreferrer" className={nnButton("secondary")}>
          WhatsApp
        </a>
        <button type="button" onClick={copy} className={nnButton("secondary")}>Copy</button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Only you can see it. It disappears if {otherName} stops sharing.</p>
    </section>
  );
};

/** "Share your phone number with {name}?" shown once after a sit is confirmed. */
export const PhoneShareAsk = ({
  otherName,
  verified,
  onShare,
  onNotNow,
}: {
  otherName: string;
  verified: boolean;
  onShare: () => void;
  onNotNow: () => void;
}) => (
  <section aria-label="Share your phone number?" className={cn(CARD, "self-center bg-[var(--nn-soft)]")}>
    <p className="flex items-center gap-2 text-[15px] font-bold">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-[var(--nn-accent-dark)]" aria-hidden="true">
        <Phone className="h-[18px] w-[18px]" />
      </span>
      Share your phone number with {otherName}?
    </p>
    {verified ? (
      <>
        <p className="mt-2 text-sm text-muted-foreground">
          Your sit is confirmed, so you can choose to share it. Only {otherName} will see it, and you can stop any time.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onShare} className={nnButton("primary")}>Share my number</button>
          <button type="button" onClick={onNotNow} className={nnButton("secondary")}>Not now</button>
        </div>
      </>
    ) : (
      <>
        <p className="mt-2 text-sm text-muted-foreground">Add a verified phone number first.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/settings?verify=phone" className={nnButton("primary")}>Add my number in Settings</Link>
          <button type="button" onClick={onNotNow} className={nnButton("secondary")}>Not now</button>
        </div>
      </>
    )}
  </section>
);

/** The confirm sheet: your verified number, three points, Share / Not now. */
export const PhoneShareSheet = ({
  open,
  onOpenChange,
  otherName,
  state,
  onConfirm,
  sharing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  otherName: string;
  state: PhoneShareState | null;
  onConfirm: () => void;
  sharing: boolean;
}) => {
  const verified = !!state?.my_phone_verified && !!state.my_number;
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Share your number with ${otherName}?`}
      description={`Choose whether to share your verified phone number with ${otherName}.`}
    >
      {verified ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--nn-border)] p-4">
            <span className="flex flex-col">
              <span className="text-sm text-muted-foreground">Your verified number</span>
              <span className="text-lg font-bold">{state!.my_number}</span>
            </span>
            <span className="rounded-full bg-[var(--nn-ok-bg)] px-2.5 py-1 text-xs font-bold text-brand-teal-text">✓ Verified</span>
          </div>
          <ul className="list-disc space-y-1.5 pl-5 text-[15px]">
            <li>Only {otherName} sees it, in this chat.</li>
            <li>It never appears on your profile.</li>
            <li>You can stop sharing any time.</li>
          </ul>
          <button type="button" onClick={onConfirm} disabled={sharing} className={nnButton("primary", "w-full")}>
            {sharing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Share my number
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className={nnButton("secondary", "w-full")}>
            Not now
          </button>
          <Link to="/settings?verify=phone" className="inline-flex min-h-[44px] items-center justify-center text-sm font-semibold text-muted-foreground underline underline-offset-4">
            Wrong number? Change it in Settings
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[15px]">Add a verified phone number first. Then you can choose to share it with {otherName}.</p>
          <Link to="/settings?verify=phone" className={nnButton("primary", "w-full")}>Add my number in Settings</Link>
          <button type="button" onClick={() => onOpenChange(false)} className={nnButton("secondary", "w-full")}>
            Not now
          </button>
        </div>
      )}
    </ResponsiveSheet>
  );
};
