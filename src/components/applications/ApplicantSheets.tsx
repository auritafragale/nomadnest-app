import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import { nnButton } from "@/components/nn/ui";
import { useCommunityWarning } from "@/hooks/useCommunityWarning";
import { cn } from "@/lib/utils";

const NOTE_MAX = 300;

const andList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * "Confirm {name} for {dates}?": what happens next in three plain points.
 * The strike-three community notice shows inside, in the amber box.
 */
export const ConfirmApplicantSheet = ({
  open,
  onOpenChange,
  name,
  dates,
  sitterUserId,
  others,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  dates: string;
  sitterUserId: string | undefined;
  others: number;
  pending: boolean;
  onConfirm: () => void;
}) => {
  const warning = useCommunityWarning("user", open ? sitterUserId : undefined);
  const points = [
    `${name} hears straight away and the sit appears in both your dashboards.`,
    others > 0
      ? `The ${others} other ${others === 1 ? "applicant" : "applicants"} for these dates ${others === 1 ? "is" : "are"} told kindly that they are taken.`
      : "No one else has applied for these dates.",
    `Your address and Welcome Guide unlock for ${name} 48 hours before the sit.`,
  ];
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Confirm ${name} for ${dates}?`}
      description={`What happens when you confirm ${name}`}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onOpenChange(false)} className={nnButton("secondary", "h-12")}>
            Not now
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} className={nnButton("primary", "h-12")}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirm {name}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {warning.hasWarning && (
          <div role="note" className="flex gap-3 rounded-2xl border border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] p-4 text-[var(--nn-tip-text)]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-[15px]">
              <strong>Community notice.</strong> Several recent Pet Parents privately shared feedback about this Nomad:{" "}
              {andList(warning.labels.map((l) => l.toLowerCase()))}. You can still confirm.
            </p>
          </div>
        )}
        <ol className="flex flex-col gap-3">
          {points.map((p, i) => (
            <li key={p} className="flex gap-3 text-[16px] leading-snug">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--nn-tint)] text-sm font-bold text-[var(--nn-accent-dark)]">
                {i + 1}
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
      </div>
    </ResponsiveSheet>
  );
};

/** "Decline {name}?": the kind default note plus an optional personal note. */
export const DeclineApplicantSheet = ({
  open,
  onOpenChange,
  name,
  ownerFirstName,
  pending,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  ownerFirstName: string | null;
  pending: boolean;
  onDecline: (note: string) => void;
}) => {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open]);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Decline ${name}?`}
      description={`Decline ${name} with a kind note`}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onOpenChange(false)} className={nnButton("secondary", "h-12")}>
            Not now
          </button>
          <button type="button" onClick={() => onDecline(note)} disabled={pending} className={nnButton("primary", "h-12")}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Decline
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[16px] leading-relaxed">
          We'll send a kind note: “Thank you for applying. {ownerFirstName || "The Pet Parent"} isn't going ahead with you for these
          dates this time.”
        </p>
        <div className="flex flex-col gap-2">
          <label htmlFor="decline-note" className="text-[15px] font-bold">
            Add a personal note (optional)
          </label>
          <Textarea
            id="decline-note"
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            rows={4}
            aria-describedby="decline-note-count"
            className="resize-none rounded-2xl text-base"
          />
          <p id="decline-note-count" className="text-right text-sm text-muted-foreground" aria-live="polite">
            {note.length}/{NOTE_MAX}
          </p>
          <p className="text-sm text-muted-foreground">Phone numbers, emails and links are taken out before it's sent.</p>
        </div>
      </div>
    </ResponsiveSheet>
  );
};

export type SortKey = "soonest" | "recent" | "reviews" | "rating";
export type PlaceKey = "any" | "near" | "abroad";
export interface ApplicantFilters {
  sort: SortKey;
  place: PlaceKey;
  pet: string;
}
export const DEFAULT_FILTERS: ApplicantFilters = { sort: "soonest", place: "any", pet: "any" };
export const filtersActive = (f: ApplicantFilters) => f.sort !== "soonest" || f.place !== "any" || f.pet !== "any";
export const SORT_LABEL: Record<SortKey, string> = {
  soonest: "Earliest sit",
  recent: "Most recent",
  reviews: "Most reviews",
  rating: "Highest rating",
};

const PET_OPTIONS: [string, string][] = [
  ["any", "Any"],
  ["dogs", "Dogs"],
  ["cats", "Cats"],
  ["birds", "Birds"],
  ["rabbits", "Rabbits"],
  ["other", "Other"],
];

/** The filter groups, used in the sheet (phone, tablet) and inline (desktop). */
export const ApplicantFilterGroups = ({ value, onChange }: { value: ApplicantFilters; onChange: (f: ApplicantFilters) => void }) => {
  const group = <K extends keyof ApplicantFilters>(title: string, key: K, options: [ApplicantFilters[K], string][]) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[15px] font-bold">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, label]) => {
          const on = value[key] === v;
          return (
            <button
              key={String(v)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ ...value, [key]: v })}
              className={cn(
                "inline-flex h-11 items-center rounded-full border-[1.5px] px-4 text-sm",
                on ? "border-[var(--nn-accent)] bg-[var(--nn-tint)] font-bold" : "border-border bg-card font-semibold",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
  return (
    <div className="flex flex-col gap-5">
      {group("Sort by", "sort", Object.entries(SORT_LABEL) as [SortKey, string][])}
      {group("Where the Nomad is based", "place", [
        ["any", "Anywhere"],
        ["near", "Near me"],
        ["abroad", "Abroad"],
      ])}
      {group("Animal experience", "pet", PET_OPTIONS)}
    </div>
  );
};

/** Sort and filter: a draft until "Show applicants". */
export const ApplicantFilterSheet = ({
  open,
  onOpenChange,
  value,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: ApplicantFilters;
  onApply: (f: ApplicantFilters) => void;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Sort and filter"
      description="Sort and filter applicants"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => setDraft(DEFAULT_FILTERS)} className="min-h-11 px-2 text-[15px] font-bold underline underline-offset-2">
            Clear all
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
            className={nnButton("primary", "h-12 px-6")}
          >
            Show applicants
          </button>
        </div>
      }
    >
      <ApplicantFilterGroups value={draft} onChange={setDraft} />
    </ResponsiveSheet>
  );
};
