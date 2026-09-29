import { Link, useNavigate } from "react-router-dom";
import { EyeOff, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The bar on top of your own public profile when you open it with the eye
 * button: Done, and a "Show tips" switch. With tips off the page is exactly
 * what other members see.
 */
export const PreviewBar = ({
  showTips,
  onToggleTips,
  accent,
}: {
  showTips: boolean;
  onToggleTips: () => void;
  accent: "coral" | "teal";
}) => {
  const navigate = useNavigate();
  const on = accent === "coral" ? "bg-brand-coral" : "bg-brand-teal";
  const done = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/dashboard", { replace: true });
  };
  return (
    <div className="sticky top-16 z-30 border-b border-[var(--nn-border)] bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-3 lg:max-w-[74rem]">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg">Preview of your profile</p>
          <button type="button" onClick={done} className={cn("h-11 rounded-full px-5 text-sm font-bold text-white", on)}>
            Done
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            {showTips ? "Tips are on. Turn them off to see exactly what other members see." : "Exactly what other members see."}
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={showTips}
            aria-label="Show tips"
            onClick={onToggleTips}
            className={cn("relative h-8 w-[52px] shrink-0 rounded-full transition-colors before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']", showTips ? on : "bg-muted-foreground/40")}
          >
            <span
              className={cn(
                "absolute top-1 h-6 w-6 rounded-full bg-card transition-[left]",
                showTips ? "left-6" : "left-1",
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

/** An owner-only hint shown in preview with tips on. */
export const PreviewTip = ({ title, text, action }: { title: string; text: string; action?: { label: string; to: string } }) => (
  <div className="mb-6 rounded-[20px] border border-dashed border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] p-4">
    <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--nn-tip-text)]">
      <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
      Tip · Only you see this
    </p>
    <p className="text-[15px] font-bold">{title}</p>
    <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
    {action && (
      <Link to={action.to} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-bold text-[var(--nn-tip-text)] underline-offset-2 hover:underline">
        {action.label}
      </Link>
    )}
  </div>
);

/** Shown instead of the profile when other members can't see it at all. */
export const HiddenProfileNotice = ({ text, action }: { text: string; action?: { label: string; to: string } }) => (
  <div className="mb-6 flex items-start gap-3 rounded-[20px] border border-[var(--nn-border)] bg-[var(--nn-soft)] p-4">
    <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-brand-coral-text" aria-hidden="true" />
    <div>
      <p className="text-[15px] font-bold">Your profile is hidden</p>
      <p className="text-sm text-muted-foreground">{text}</p>
      {action && (
        <Link to={action.to} className="mt-1 inline-flex min-h-[44px] items-center text-sm font-bold text-brand-coral-text underline-offset-2 hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  </div>
);

/** "Never shown on your profile" footnote. */
export const NeverShownNote = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-6 rounded-[20px] bg-muted p-4 text-[13px] leading-relaxed text-muted-foreground">
    <strong>Never shown on your profile:</strong> {children}
  </p>
);
