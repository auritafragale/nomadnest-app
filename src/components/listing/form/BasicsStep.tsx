import { CalendarIcon, Lock, Plus, Trash2, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ListingFormData, SitDate } from "@/hooks/useListingForm";
import { BEST_FOR, FLEXIBILITY, HANDOVER } from "@/lib/listingOptions";
import { AI_SUGGESTION_NOTE, petContext, useWritingHelper } from "@/hooks/useWritingHelper";
import { useToast } from "@/hooks/use-toast";
import { nightsBetween, nnButton, shortRange } from "@/components/nn/ui";
import { AiButton, CharCount, FieldError, FieldLabel, SelectField, StepTitle, inputClass } from "./FormBits";
import { cn } from "@/lib/utils";

export const TITLE_MAX = 80;

const longRange = (s: string, e: string) => `${shortRange(s, e)} ${e.slice(0, 4)}`;

const DateCard = ({
  date,
  index,
  canRemove,
  applicants,
  bookedWith,
  onChange,
  onRemove,
  error,
}: {
  date: SitDate;
  index: number;
  canRemove: boolean;
  applicants?: number;
  bookedWith?: string | null;
  onChange: (d: Partial<SitDate>) => void;
  onRemove: () => void;
  error?: string;
}) => {
  const complete = !!date.start_date && !!date.end_date;
  const nights = complete ? nightsBetween(date.start_date, date.end_date) : 0;
  const label = complete ? longRange(date.start_date, date.end_date) : `Date range ${index + 1}`;

  if (date.locked) {
    return (
      <div className="flex flex-col gap-1 rounded-[20px] border border-dashed border-border bg-muted/60 p-4">
        <p className="flex items-center gap-2 text-[16px] font-bold">
          <Lock className="h-4 w-4" aria-hidden="true" />
          {label}
        </p>
        <p className="text-[15px] font-semibold">Booked{bookedWith ? ` with ${bookedWith}` : ""}</p>
        <p className="text-sm text-muted-foreground">These dates belong to a confirmed sit. To change them, use Propose new dates on the sit.</p>
      </div>
    );
  }

  const onRange = (range: DateRange | undefined) =>
    onChange({
      start_date: range?.from ? format(range.from, "yyyy-MM-dd") : "",
      end_date: range?.to ? format(range.to, "yyyy-MM-dd") : "",
    });

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--nn-border)] bg-card p-4">
      <div className="flex items-start gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-describedby={error ? `date-err-${date.id}` : undefined}
              className={cn(inputClass, "flex flex-1 items-center gap-2 text-left font-bold", !complete && "font-semibold text-muted-foreground")}
            >
              <CalendarIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {complete ? `${label} · ${nights} ${nights === 1 ? "night" : "nights"}` : date.start_date ? `${format(parseISO(date.start_date), "d MMM yyyy")} – pick an end date` : "Pick the dates"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: date.start_date ? parseISO(date.start_date) : undefined, to: date.end_date ? parseISO(date.end_date) : undefined }}
              onSelect={onRange}
              disabled={(d) => d < new Date()}
              numberOfMonths={1}
              initialFocus
              className="pointer-events-auto p-3"
            />
          </PopoverContent>
        </Popover>
        {canRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${complete ? label : `date range ${index + 1}`}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
      {date.start_date && !date.end_date && <p className="text-sm font-semibold text-destructive">Pick an end date to complete this range.</p>}
      {error && <FieldError id={`date-err-${date.id}`}>{error}</FieldError>}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`flex-${date.id}`} className="text-sm font-bold">
            Flexibility
          </label>
          <SelectField id={`flex-${date.id}`} value={date.flexibility} onChange={(v) => onChange({ flexibility: v })} options={FLEXIBILITY} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`hand-${date.id}`} className="text-sm font-bold">
            Handover
          </label>
          <SelectField id={`hand-${date.id}`} value={date.handover_preference} onChange={(v) => onChange({ handover_preference: v })} options={HANDOVER} />
        </div>
      </div>
      {applicants !== undefined && applicants > 0 && (
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--nn-accent-dark)]">
          <Users className="h-4 w-4" aria-hidden="true" />
          {applicants} {applicants === 1 ? "applicant" : "applicants"} for these dates
        </p>
      )}
    </div>
  );
};

/** Basics: title, dates, who it suits best. */
const BasicsStep = ({
  formData,
  updateFormData,
  addSitDate,
  updateSitDate,
  onRemoveDate,
  applicantCounts,
  bookedNames,
  errors,
}: {
  formData: ListingFormData;
  updateFormData: (d: Partial<ListingFormData>) => void;
  addSitDate: () => void;
  updateSitDate: (id: string, d: Partial<SitDate>) => void;
  onRemoveDate: (date: SitDate) => void;
  applicantCounts?: Record<string, number>;
  bookedNames?: Record<string, string | null>;
  errors: Record<string, string>;
}) => {
  const { toast } = useToast();
  const ai = useWritingHelper();
  const editable = formData.sit_dates.filter((d) => !d.locked);

  const helpMeWrite = async () => {
    try {
      const suggestion = await ai.suggest.mutateAsync({
        kind: "listing_title",
        text: formData.title,
        context: { city: formData.city, home_type: formData.home_type, pets: petContext(formData.pets) },
      });
      updateFormData({ title: suggestion.slice(0, TITLE_MAX), titleAi: true });
    } catch (e) {
      toast({ title: "Couldn't write a title", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <StepTitle>The basics</StepTitle>

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="listing-title" extra={ai.visible && <AiButton label="Help me write it" busy={ai.suggest.isPending} onClick={helpMeWrite} />}>
          Listing title
        </FieldLabel>
        <input
          id="listing-title"
          value={formData.title}
          maxLength={TITLE_MAX}
          onChange={(e) => updateFormData({ title: e.target.value.slice(0, TITLE_MAX), titleAi: false })}
          placeholder="e.g. Sunny flat with two friendly cats"
          aria-invalid={!!errors.title}
          aria-describedby="title-hint title-count"
          className={inputClass}
        />
        <div className="flex items-start justify-between gap-3">
          <p id="title-hint" className="text-sm text-muted-foreground">
            {formData.titleAi ? AI_SUGGESTION_NOTE : "Make it clear and inviting."}
          </p>
          <CharCount id="title-count" value={formData.title} max={TITLE_MAX} />
        </div>
        {errors.title && <FieldError id="title-err">{errors.title}</FieldError>}
      </div>

      <section id="listing-dates" aria-labelledby="dates-title" className="flex scroll-mt-24 flex-col gap-3">
        <div>
          <h3 id="dates-title" className="text-[17px] font-bold">
            When do you need a Nomad?
          </h3>
          <p className="text-[15px] text-muted-foreground">Add each trip as its own date range.</p>
        </div>
        {formData.sit_dates.map((d, i) => (
          <DateCard
            key={d.id}
            date={d}
            index={i}
            canRemove={editable.length > 1 || formData.sit_dates.length > 1}
            applicants={applicantCounts?.[d.id]}
            bookedWith={bookedNames?.[d.id]}
            onChange={(patch) => updateSitDate(d.id, patch)}
            onRemove={() => onRemoveDate(d)}
            error={errors[`date-${d.id}`]}
          />
        ))}
        {errors.dates && <FieldError id="dates-err">{errors.dates}</FieldError>}
        <button type="button" onClick={addSitDate} className={nnButton("secondary", "self-start")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add another date range
        </button>
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[17px] font-bold">
          Who would this sit suit best? <span className="text-[15px] font-normal text-muted-foreground">(optional)</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {BEST_FOR.map((b) => {
            const on = formData.ideal_nomad_types.includes(b.value);
            return (
              <button
                key={b.value}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() =>
                  updateFormData({
                    ideal_nomad_types: on ? formData.ideal_nomad_types.filter((t) => t !== b.value) : [...formData.ideal_nomad_types, b.value],
                  })
                }
                className={cn(
                  "flex min-h-[64px] flex-col justify-center rounded-2xl px-4 py-2 text-left",
                  on ? "border-2 border-[var(--nn-accent)] bg-[var(--nn-tint)]" : "border-[1.5px] border-border bg-card",
                )}
              >
                <span className="text-[15px] font-bold">{b.label}</span>
                <span className="text-sm text-muted-foreground">{b.sub}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
};

export default BasicsStep;
