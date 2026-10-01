import { List, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import LocationSearchInput from "@/components/search/LocationSearchInput";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import { nnButton } from "@/components/nn/ui";
import { PET_TYPE_OPTIONS, formatPetType } from "@/lib/petTypes";
import { cn } from "@/lib/utils";

export interface NomadFilterState {
  petTypes: string[];
  experienceLevels: string[];
  languages: string[];
}

export const EMPTY_NOMAD_FILTERS: NomadFilterState = { petTypes: [], experienceLevels: [], languages: [] };

const PET_CHOICES = PET_TYPE_OPTIONS.filter((p) => p !== "farm");
const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Italian", "Japanese", "Mandarin"];
const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "experienced", label: "Experienced" },
  { value: "professional", label: "Professional" },
];

const nomadTags = (f: NomadFilterState) => [
  ...f.petTypes.map((v) => ({ key: `pet:${v}`, label: formatPetType(v), remove: (s: NomadFilterState) => ({ ...s, petTypes: s.petTypes.filter((x) => x !== v) }) })),
  ...f.experienceLevels.map((v) => ({
    key: `level:${v}`,
    label: LEVELS.find((l) => l.value === v)?.label ?? v,
    remove: (s: NomadFilterState) => ({ ...s, experienceLevels: s.experienceLevels.filter((x) => x !== v) }),
  })),
  ...f.languages.map((v) => ({ key: `lang:${v}`, label: v, remove: (s: NomadFilterState) => ({ ...s, languages: s.languages.filter((x) => x !== v) }) })),
];

export const nomadFilterCount = (f: NomadFilterState) => f.petTypes.length + f.experienceLevels.length + f.languages.length;

const Chip = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={cn(
      "inline-flex h-11 items-center rounded-full border-[1.5px] px-4 text-sm",
      on ? "border-[var(--nn-accent)] bg-[var(--nn-tint)] font-bold" : "border-border bg-card font-semibold",
    )}
  >
    {label}
  </button>
);

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** One Filters panel: pets, experience and languages. Applies as you tap. */
export const NomadFiltersPanel = ({
  open,
  onOpenChange,
  filters,
  onChange,
  resultCount,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filters: NomadFilterState;
  onChange: (f: NomadFilterState) => void;
  resultCount: number | null;
}) => {
  const group = (title: string, children: React.ReactNode) => (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 text-[15px] font-bold">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      description="Narrow down the Nomads you see"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => onChange(EMPTY_NOMAD_FILTERS)} className="min-h-11 px-2 text-[15px] font-bold underline underline-offset-2">
            Clear all
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className={nnButton("primary", "h-12 px-6")}>
            {resultCount === null ? "Show Nomads" : `Show ${resultCount} ${resultCount === 1 ? "Nomad" : "Nomads"}`}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {group(
          "Pets they know",
          PET_CHOICES.map((p) => <Chip key={p} on={filters.petTypes.includes(p)} label={formatPetType(p)} onClick={() => onChange({ ...filters, petTypes: toggle(filters.petTypes, p) })} />),
        )}
        {group(
          "Experience",
          LEVELS.map((l) => (
            <Chip key={l.value} on={filters.experienceLevels.includes(l.value)} label={l.label} onClick={() => onChange({ ...filters, experienceLevels: toggle(filters.experienceLevels, l.value) })} />
          )),
        )}
        {group(
          "Languages",
          LANGUAGES.map((l) => <Chip key={l} on={filters.languages.includes(l)} label={l} onClick={() => onChange({ ...filters, languages: toggle(filters.languages, l) })} />),
        )}
      </div>
    </ResponsiveSheet>
  );
};

/** Search, Filters (with a count), List / Map, then the active filters as tags. */
export const NomadFilterBar = ({
  search,
  onSearch,
  filters,
  onChange,
  onOpenFilters,
  viewMode,
  onViewModeChange,
}: {
  search: string;
  onSearch: (v: string) => void;
  filters: NomadFilterState;
  onChange: (f: NomadFilterState) => void;
  onOpenFilters: () => void;
  viewMode: "grid" | "map";
  onViewModeChange: (m: "grid" | "map") => void;
}) => {
  const tags = nomadTags(filters);
  const seg = (mode: "grid" | "map", label: string, Icon: typeof List) => (
    <button
      type="button"
      aria-pressed={viewMode === mode}
      onClick={() => onViewModeChange(mode)}
      className={cn("flex h-11 items-center gap-1.5 rounded-full px-3 text-sm sm:px-4", viewMode === mode ? "bg-card font-bold shadow-sm" : "font-semibold text-muted-foreground")}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <LocationSearchInput wrapperClassName="w-full lg:flex-1" placeholder="Name, place or language" value={search} onChange={onSearch} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={onOpenFilters} className="flex h-11 items-center gap-2 rounded-full border-[1.5px] border-border bg-card px-4 text-sm font-bold">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters
            {tags.length > 0 && (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--nn-accent)] px-1.5 text-xs font-bold text-primary-foreground">
                {tags.length}
              </span>
            )}
          </button>
          <div role="group" aria-label="View" className="ml-auto flex rounded-full bg-muted p-1">
            {seg("grid", "List", List)}
            {seg("map", "Map", MapIcon)}
          </div>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.remove(filters))}
              aria-label={`Remove filter: ${t.label}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--nn-tint)] px-3.5 text-sm font-semibold"
            >
              {t.label}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={() => onChange(EMPTY_NOMAD_FILTERS)} className="min-h-11 px-2 text-sm font-bold underline-offset-2 hover:underline">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};

