import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Loader2, Lock, type LucideIcon } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";
import { NN_PAGE, nnButton } from "@/components/nn/ui";
import { useWritingHelper, AI_SUGGESTION_NOTE, type WritingKind } from "@/hooks/useWritingHelper";
import { useToast } from "@/hooks/use-toast";
import { AiButton, CharCount, FieldLabel, inputClass } from "@/components/listing/form/FormBits";
import { cn } from "@/lib/utils";

export type SectionKind = "done" | "todo" | "link" | "private";

export interface SectionDef {
  id: string;
  title: string;
  status: string;
  kind: SectionKind;
  /** One line shown on tablet and desktop. */
  summary?: string;
  to: string;
  icon: LucideIcon;
  /** The first unfinished section gets the accent outline. */
  highlight?: boolean;
}

/** The hub: completion card, a grid of sections, and the privacy note. */
export const EditorHub = ({
  title,
  percent,
  hint,
  previewTo,
  sections,
  note,
}: {
  title: string;
  percent: number;
  hint: string;
  previewTo: string;
  sections: SectionDef[];
  note: string;
}) => (
  <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-5 pb-24 pt-20 md:pt-24")}>
    <div className="flex flex-col gap-1">
      <BackButton fallback="/dashboard" label="Dashboard" className="h-11 self-start" />
      <h1 className="font-display text-[32px] font-normal leading-tight lg:text-[38px]">{title}</h1>
    </div>

    <section aria-label="How complete your profile is" className="flex flex-col gap-3 rounded-[22px] border border-[var(--nn-border)] bg-[var(--nn-soft)] p-4 md:flex-row md:items-center md:gap-6 md:p-5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="flex items-baseline justify-between gap-3 text-[17px] font-bold">
          {percent >= 100 ? "Your profile is complete" : `Your profile is ${percent}% done`}
          <span className="text-[15px] text-[var(--nn-accent-dark)]">{percent}%</span>
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile complete">
          <div className="h-full rounded-full bg-[var(--nn-accent)]" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-[15px] text-muted-foreground">{hint}</p>
      </div>
      <Link to={previewTo} className={nnButton("secondary", "self-start md:self-center")}>
        Preview my profile
      </Link>
    </section>

    <section aria-labelledby="sections-title" className="flex flex-col gap-3">
      <div>
        <h2 id="sections-title" className="font-sans text-[17px] font-bold">
          Your sections
        </h2>
        <p className="text-sm text-muted-foreground">Choose one to edit</p>
      </div>
      <ul className="grid grid-cols-3 gap-2 md:gap-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.id}>
              <Link
                to={s.to}
                aria-label={`${s.title}, ${s.status.replace(/^[✓🔒] ?/u, "")}`}
                className={cn(
                  "flex h-full min-h-[124px] flex-col items-start gap-2 rounded-[18px] border-[1.5px] bg-[var(--nn-soft)] p-3 text-left md:p-4",
                  s.highlight ? "border-[var(--nn-accent)]" : "border-transparent",
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full",
                    s.kind === "private" ? "bg-[var(--nn-ok-bg)] text-brand-teal-text" : s.kind === "link" ? "bg-card text-[var(--nn-accent-dark)]" : "bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-[15px] font-bold leading-snug">{s.title}</span>
                {s.summary && <span className="hidden text-sm text-muted-foreground md:block">{s.summary}</span>}
                <span
                  className={cn(
                    "mt-auto text-xs font-bold leading-snug md:text-sm",
                    s.kind === "done" ? "text-brand-teal-text" : s.kind === "todo" ? "text-[var(--nn-accent-dark)]" : "text-muted-foreground",
                  )}
                >
                  {s.status}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>

    <p className="flex items-start gap-2 rounded-[20px] bg-muted p-4 text-sm text-muted-foreground">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{note}</span>
    </p>
  </main>
);

/** One section on its own page, with a single Save. */
export const SectionPage = ({
  hubTo,
  hubLabel,
  title,
  intro,
  onSave,
  saving,
  children,
}: {
  hubTo: string;
  hubLabel: string;
  title: string;
  intro?: string;
  onSave: () => void;
  saving: boolean;
  children: ReactNode;
}) => {
  const save = (
    <button type="button" onClick={onSave} disabled={saving} className={nnButton("primary", "h-12 w-full md:w-auto md:px-10")}>
      {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      Save
    </button>
  );
  return (
    <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-5 pb-32 pt-20 md:pb-16 md:pt-24")}>
      <div className="flex flex-col gap-1">
        <Link to={hubTo} className={nnButton("ghost", "-ml-3 self-start text-foreground")}>
          ← {hubLabel}
        </Link>
        <h1 className="font-display text-[30px] font-normal leading-tight lg:text-[36px]">{title}</h1>
        {intro && <p className="text-[15px] text-muted-foreground">{intro}</p>}
      </div>
      <div className="flex max-w-2xl flex-col gap-5">
        {children}
        <div className="hidden md:block">{save}</div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden">{save}</div>
    </main>
  );
};

/** A bio with ✦ Polish with AI; the suggestion only fills the field. */
export const BioField = ({
  id,
  label,
  value,
  onChange,
  kind,
  aiUsed,
  onAiUsed,
  helper,
  aiNote = AI_SUGGESTION_NOTE,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  kind: WritingKind;
  aiUsed: boolean;
  onAiUsed: (v: boolean) => void;
  helper?: string;
  aiNote?: string;
}) => {
  const ai = useWritingHelper();
  const { toast } = useToast();
  const polish = async () => {
    try {
      const suggestion = await ai.suggest.mutateAsync({ kind, text: value });
      onChange(suggestion);
      onAiUsed(true);
    } catch (e) {
      toast({ title: "Couldn't polish the text", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id} extra={ai.visible && <AiButton label="Polish with AI" busy={ai.suggest.isPending} onClick={polish} disabled={!value.trim()} />}>
        {label}
      </FieldLabel>
      <textarea
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onAiUsed(false);
        }}
        rows={6}
        aria-describedby={[aiUsed ? `${id}-ai` : null, helper ? `${id}-help` : null].filter(Boolean).join(" ") || undefined}
        className={cn(inputClass, "resize-y")}
      />
      {aiUsed && (
        <p id={`${id}-ai`} className="text-sm text-muted-foreground">
          {aiNote}
        </p>
      )}
      {helper && (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {helper}
        </p>
      )}
    </div>
  );
};

/** A text input with a character limit and counter. */
export const LimitedInput = ({
  id,
  label,
  value,
  onChange,
  max,
  hint,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  hint?: string;
  placeholder?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <input
      id={id}
      value={value}
      maxLength={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.slice(0, max))}
      aria-describedby={`${id}-count${hint ? ` ${id}-hint` : ""}`}
      className={inputClass}
    />
    <div className="flex items-start justify-between gap-3">
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : (
        <span />
      )}
      <CharCount id={`${id}-count`} value={value} max={max} />
    </div>
  </div>
);

/** Last name and the verified phone (read-only; changed in Settings). Never on the profile. */
export const PrivateDetailsFields = ({
  lastName,
  onLastName,
  phone,
  phoneVerified,
}: {
  lastName: string;
  onLastName: (v: string) => void;
  phone: string | null;
  phoneVerified: boolean;
}) => (
  <div className="flex flex-col gap-5">
    <p className="flex items-start gap-2 rounded-[20px] bg-[var(--nn-ok-bg)] p-4 text-[15px]">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal-text" aria-hidden="true" />
      Only you and the NomadNest team can see these. They never appear on your profile.
    </p>
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor="last-name">Last name</FieldLabel>
      <input id="last-name" value={lastName} onChange={(e) => onLastName(e.target.value)} autoComplete="family-name" className={inputClass} />
    </div>
    <div className="flex flex-col gap-1.5">
      <span className="text-[15px] font-bold">Phone number</span>
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border-[1.5px] border-border bg-muted px-3">
        <span className="text-base">{phone || "No number added yet"}</span>
        {phone && phoneVerified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--nn-ok-bg)] px-2.5 py-0.5 text-xs font-bold text-brand-teal-text">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Verified
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Never shared automatically. Once a sit is confirmed, you can choose to share it in your chat with them, and stop any time. Change the
        number in Settings.
      </p>
      <Link to="/settings?verify=phone" className={nnButton("secondary", "self-start")}>
        {phone ? "Change it in Settings" : "Add it in Settings"}
      </Link>
    </div>
  </div>
);

/** Load error with Try again. */
export const CouldNotLoad = ({ onRetry }: { onRetry: () => void }) => (
  <main className={cn(NN_PAGE, "flex flex-1 flex-col items-center pt-24")}>
    <div role="alert" className="flex max-w-md flex-col items-center gap-3 rounded-[22px] border border-border p-8 text-center">
      <p className="text-[17px] font-bold">We couldn't load your profile</p>
      <p className="text-[15px] text-muted-foreground">Check your connection and try again.</p>
      <button type="button" onClick={onRetry} className={nnButton("primary")}>
        Try again
      </button>
    </div>
  </main>
);
