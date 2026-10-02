import type { ReactNode } from "react";
import { ChevronDown, Loader2, Lock, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Option } from "@/lib/listingOptions";
import { cn } from "@/lib/utils";

/** Step heading. */
export const StepTitle = ({ children, intro }: { children: ReactNode; intro?: string }) => (
  <div className="flex flex-col gap-1">
    <h2 className="font-display text-[26px] font-normal leading-tight">{children}</h2>
    {intro && <p className="text-[15px] text-muted-foreground">{intro}</p>}
  </div>
);

export const FieldLabel = ({ htmlFor, children, extra }: { htmlFor?: string; children: ReactNode; extra?: ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-2">
    {htmlFor ? (
      <label htmlFor={htmlFor} className="text-[15px] font-bold">
        {children}
      </label>
    ) : (
      <span className="text-[15px] font-bold">{children}</span>
    )}
    {extra}
  </div>
);

/** "🔒 Private" marker. */
export const PrivateTag = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">
    <Lock className="h-3 w-3" aria-hidden="true" />
    Private
  </span>
);

export const inputClass =
  "flex min-h-11 w-full rounded-xl border-[1.5px] border-border bg-card px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--nn-accent)]";

/** A native select, styled to the form (simple and screen-reader friendly). */
export const SelectField = ({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
}) => (
  <div className="relative">
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, "appearance-none pr-10")}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
  </div>
);

/** Single-choice tiles (radio group). */
export const TileGroup = ({
  label,
  options,
  value,
  onChange,
  columns = "grid-cols-2 sm:grid-cols-4",
  required,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  columns?: string;
  required?: boolean;
}) => (
  <fieldset className="flex flex-col gap-2">
    <legend className="mb-2 text-[15px] font-bold">
      {label}
      {required && <span className="sr-only"> (required)</span>}
    </legend>
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", columns)}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-[52px] flex-col items-center justify-center rounded-2xl px-2 py-1 text-center text-sm",
              on ? "border-2 border-[var(--nn-accent)] bg-[var(--nn-tint)] font-bold" : "border-[1.5px] border-border bg-card font-semibold",
            )}
          >
            {o.label}
            {o.sub && <span className="text-xs font-normal text-muted-foreground">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  </fieldset>
);

/** Multi-choice pills (toggle buttons). */
export const PillGroup = ({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (v: string[]) => void;
}) => (
  <fieldset className="flex flex-col gap-2">
    <legend className="mb-2 text-[15px] font-bold">{label}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-sm",
              on ? "border-[var(--nn-accent)] bg-[var(--nn-tint)] font-bold" : "border-border bg-card font-semibold",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  </fieldset>
);

/** A switch row with a one-line description. */
export const ToggleRow = ({
  id,
  label,
  sub,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <div className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2">
    <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col">
      <span className="text-[15px] font-bold">{label}</span>
      {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
    </label>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>
);

/** "x / 80" under a field. */
export const CharCount = ({ id, value, max }: { id: string; value: string; max: number }) => (
  <p id={id} className="text-right text-sm text-muted-foreground" aria-live="polite">
    {value.length} / {max}
  </p>
);

/** ✦ Help me write it / ✦ Polish with AI. */
export const AiButton = ({ label, busy, onClick, disabled }: { label: string; busy: boolean; onClick: () => void; disabled?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy || disabled}
    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-[var(--nn-accent-dark)] hover:bg-[var(--nn-soft)] disabled:opacity-60"
  >
    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
    {label}
  </button>
);

export const FieldError = ({ id, children }: { id: string; children: ReactNode }) => (
  <p id={id} role="alert" className="text-sm font-semibold text-destructive">
    {children}
  </p>
);
