import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A setting with a switch; the whole row is the label (44px+). */
export const ToggleRow = ({
  id,
  label,
  sub,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  sub?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) => (
  // The whole row is the switch (64px+ tap target); the switch inside is
  // drawn at its usual size.
  <button
    type="button"
    id={id}
    role="switch"
    aria-checked={checked}
    aria-labelledby={`${id}-label`}
    aria-describedby={sub ? `${id}-sub` : undefined}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "flex min-h-[64px] w-full cursor-pointer items-center justify-between gap-4 rounded-[18px] border border-[var(--nn-border)] bg-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      disabled && "cursor-default opacity-70",
    )}
  >
    <span className="flex min-w-0 flex-col gap-0.5">
      <span id={`${id}-label`} className="text-[15px] font-semibold">{label}</span>
      {sub && <span id={`${id}-sub`} className="text-sm text-muted-foreground">{sub}</span>}
    </span>
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span className={cn("block h-5 w-5 rounded-full bg-background shadow-lg transition-transform", checked ? "translate-x-5" : "translate-x-0")} />
    </span>
  </button>
);

/** A fact about the account: label, value, a line under it and a chip. */
export const InfoRow = ({ label, value, sub, chip, chipTone = "ok" }: { label: string; value?: ReactNode; sub?: ReactNode; chip?: string; chipTone?: "ok" | "warn" | "grey" }) => (
  <div className="flex items-start justify-between gap-3 rounded-[18px] border border-[var(--nn-border)] bg-card p-4">
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value !== undefined && <span className="break-words text-[16px] font-bold">{value}</span>}
      {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
    </div>
    {chip && (
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
          chipTone === "ok" && "bg-[var(--nn-ok-bg)] text-brand-teal-text",
          chipTone === "warn" && "bg-[var(--nn-tip-bg)] text-[var(--nn-tip-text)]",
          chipTone === "grey" && "bg-muted text-muted-foreground",
        )}
      >
        {chip}
      </span>
    )}
  </div>
);

/** Pick one of a few options (a radio group drawn as a segmented control). */
export const Segmented = <T extends string>({
  label,
  options,
  value,
  onChange,
  sub,
  disabled,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  sub?: string;
  disabled?: boolean;
}) => (
  <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--nn-border)] bg-card p-4">
    <span id={`seg-${label}`} className="text-[15px] font-semibold">
      {label}
    </span>
    <div role="radiogroup" aria-labelledby={`seg-${label}`} className="grid gap-1 rounded-full bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={cn(
            "min-h-[44px] rounded-full px-2 text-sm font-bold leading-tight",
            value === o.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
    {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
  </div>
);

export const Note = ({ children, warm }: { children: ReactNode; warm?: boolean }) => (
  <p className={cn("rounded-[18px] p-4 text-sm", warm ? "bg-[var(--nn-tip-bg)] text-[var(--nn-tip-text)]" : "bg-muted text-muted-foreground")}>{children}</p>
);

export const GroupTitle = ({ children }: { children: ReactNode }) => <h2 className="pt-2 font-sans text-[15px] font-bold">{children}</h2>;
