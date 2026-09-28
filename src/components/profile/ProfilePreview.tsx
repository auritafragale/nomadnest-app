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
  const on = accent === "coral" ? "bg-[#C4553E]" : "bg-[#237A6D]";
  const done = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/dashboard", { replace: true });
  };
  return (
    <div className="sticky top-16 z-30 border-b border-[#F0DCD4] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg">Preview of your profile</p>
          <button type="button" onClick={done} className={cn("h-11 rounded-full px-5 text-sm font-bold text-white", on)}>
            Done
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[#656B74]">
            {showTips ? "Tips are on. Turn them off to see exactly what other members see." : "Exactly what other members see."}
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={showTips}
            aria-label="Show tips"
            onClick={onToggleTips}
            className={cn("relative h-8 w-[52px] shrink-0 rounded-full transition-colors", showTips ? on : "bg-[#C9BDB8]")}
          >
            <span
              className={cn(
                "absolute top-1 h-6 w-6 rounded-full bg-white transition-[left]",
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
  <div className="mb-6 rounded-[20px] border border-dashed border-[#E8B53E] bg-[#FFF8E6] p-4">
    <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#8A6A12]">
      <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
      Tip · Only you see this
    </p>
    <p className="text-[15px] font-bold">{title}</p>
    <p className="mt-0.5 text-sm text-[#5B5145]">{text}</p>
    {action && (
      <Link to={action.to} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-bold text-[#8A4B00] underline-offset-2 hover:underline">
        {action.label}
      </Link>
    )}
  </div>
);

/** Shown instead of the profile when other members can't see it at all. */
export const HiddenProfileNotice = ({ text, action }: { text: string; action?: { label: string; to: string } }) => (
  <div className="mb-6 flex items-start gap-3 rounded-[20px] border border-[#F0DCD4] bg-[#FCF3F0] p-4">
    <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-[#A2412C]" aria-hidden="true" />
    <div>
      <p className="text-[15px] font-bold">Your profile is hidden</p>
      <p className="text-sm text-[#5B5145]">{text}</p>
      {action && (
        <Link to={action.to} className="mt-1 inline-flex min-h-[44px] items-center text-sm font-bold text-[#A2412C] underline-offset-2 hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  </div>
);

/** "Never shown on your profile" footnote. */
export const NeverShownNote = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-6 rounded-[20px] bg-[#F6F3F1] p-4 text-[13px] leading-relaxed text-[#4B5058]">
    <strong>Never shown on your profile:</strong> {children}
  </p>
);
