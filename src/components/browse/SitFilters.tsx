import { useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, Heart, List, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import LocationSearchInput from "@/components/search/LocationSearchInput";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { useSitterPreferredLocations } from "@/hooks/useSitterPreferences";
import type { ListingFilters } from "@/hooks/useListings";
import { cn } from "@/lib/utils";

/**
 * Browse Sits filters (design: BrowsePhone / BrowseTabletDark / BrowseDesktop).
 * The same controls on every size: dates, Last minute, sort, pet types,
 * "Pets and home" and "Only my places". A bottom sheet on phone, a dialog on
 * tablet and desktop. Changes apply straight away.
 */

export const PET_OPTIONS = [
  { value: "dog", label: "Dogs" },
  { value: "cat", label: "Cats" },
  { value: "bird", label: "Birds" },
  { value: "fish", label: "Fish" },
  { value: "rabbit", label: "Rabbits" },
  { value: "other", label: "Other" },
];

export const HOME_OPTIONS: { key: keyof ListingFilters; label: string }[] = [
  { key: "noPets", label: "No pets (plant care only)" },
  { key: "noMedication", label: "No medication needed" },
  { key: "aloneFourToEight", label: "Pets can be left 4–8 hours" },
  { key: "notReactive", label: "Not reactive to other animals" },
  { key: "noCarNeeded", label: "No car needed" },
  { key: "noPlantCare", label: "No plant care" },
  { key: "remoteOk", label: "Remote location OK" },
];

const dateLabel = (f: ListingFilters) => {
  if (!f.startDate && !f.endDate) return null;
  const s = f.startDate ? format(parseISO(f.startDate), "d MMM") : "";
  const e = f.endDate ? format(parseISO(f.endDate), "d MMM") : "";
  return s && e ? `${s} – ${e}` : s || e;
};

export interface FilterTag {
  key: string;
  label: string;
  remove: (f: ListingFilters) => ListingFilters;
}

/** Every active filter as a removable tag (search and sort aren't filters). */
export const activeFilterTags = (f: ListingFilters): FilterTag[] => {
  const tags: FilterTag[] = [];
  const dates = dateLabel(f);
  if (dates) tags.push({ key: "dates", label: dates, remove: (x) => ({ ...x, startDate: undefined, endDate: undefined }) });
  if (f.lastMinute) tags.push({ key: "lastMinute", label: "Last minute", remove: (x) => ({ ...x, lastMinute: undefined }) });
  for (const p of f.petTypes ?? []) {
    const label = PET_OPTIONS.find((o) => o.value === p)?.label ?? p;
    tags.push({
      key: `pet-${p}`,
      label,
      remove: (x) => {
        const next = (x.petTypes ?? []).filter((t) => t !== p);
        return { ...x, petTypes: next.length ? next : undefined };
      },
    });
  }
  for (const o of HOME_OPTIONS) {
    if (f[o.key]) tags.push({ key: String(o.key), label: o.label, remove: (x) => ({ ...x, [o.key]: undefined }) });
  }
  if (f.countries?.length || f.cities?.length) {
    tags.push({ key: "mine", label: "Only my places", remove: (x) => ({ ...x, countries: undefined, cities: undefined }) });
  }
  return tags;
};

export const clearFilters = (f: ListingFilters): ListingFilters => ({ search: f.search, sortBy: f.sortBy });

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={cn(
      "inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-sm",
      on ? "border-primary bg-primary font-bold text-primary-foreground" : "border-border bg-card font-semibold hover:bg-muted",
    )}
  >
    {children}
  </button>
);

const Switch = ({ on, onChange, title, detail }: { on: boolean; onChange: (on: boolean) => void; title: string; detail: string }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-[56px] w-full items-center gap-3 text-left">
    <span className="flex flex-1 flex-col">
      <span className="text-[15px] font-bold">{title}</span>
      <span className="text-[13px] text-muted-foreground">{detail}</span>
    </span>
    <span className={cn("relative h-8 w-[52px] shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted-foreground/40")}>
      <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-card shadow transition-all", on ? "left-6" : "left-1")} />
    </span>
  </button>
);

const Heading = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{children}</p>
);

const PanelBody = ({
  filters,
  onChange,
  resultCount,
  onDone,
}: {
  filters: ListingFilters;
  onChange: (f: ListingFilters) => void;
  resultCount: number | null;
  onDone: () => void;
}) => {
  const { user, role } = useAuth();
  const { data: preferred } = useSitterPreferredLocations();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const isNomad = !!user && (role === "sitter" || role === "both");
  const places = [...(preferred?.preferred_countries ?? []), ...(preferred?.preferred_cities ?? [])];
  const mineOn = !!(filters.countries?.length || filters.cities?.length);
  const range: DateRange | undefined =
    filters.startDate || filters.endDate
      ? { from: filters.startDate ? parseISO(filters.startDate) : undefined, to: filters.endDate ? parseISO(filters.endDate) : undefined }
      : undefined;
  const sort = filters.sortBy ?? "newest";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-4">
        <section className="space-y-2">
          <Heading>When</Heading>
          <button
            type="button"
            onClick={() => setCalendarOpen((v) => !v)}
            aria-expanded={calendarOpen}
            className="flex min-h-11 w-full items-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-left text-[15px] font-semibold"
          >
            <CalendarIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {dateLabel(filters) ?? "Any dates"}
          </button>
          {calendarOpen && (
            <div className="flex justify-center rounded-2xl border border-border">
              <Calendar
                mode="range"
                selected={range}
                onSelect={(r) =>
                  onChange({
                    ...filters,
                    startDate: r?.from ? format(r.from, "yyyy-MM-dd") : undefined,
                    endDate: r?.to ? format(r.to, "yyyy-MM-dd") : undefined,
                  })
                }
                numberOfMonths={1}
                disabled={{ before: new Date() }}
              />
            </div>
          )}
          <Switch
            on={!!filters.lastMinute}
            onChange={(on) => onChange({ ...filters, lastMinute: on || undefined })}
            title="Last minute"
            detail="Sits starting in the next 2 weeks"
          />
        </section>

        <section className="space-y-2">
          <Heading>Sort</Heading>
          <div role="group" aria-label="Sort" className="flex flex-wrap gap-2">
            <Chip on={sort === "soonest"} onClick={() => onChange({ ...filters, sortBy: "soonest" })}>
              Soonest first
            </Chip>
            <Chip on={sort === "newest"} onClick={() => onChange({ ...filters, sortBy: "newest" })}>
              Newest first
            </Chip>
          </div>
        </section>

        <section className="space-y-2">
          <Heading>Pets</Heading>
          <div className="flex flex-wrap gap-2">
            {PET_OPTIONS.map((o) => {
              const on = !!filters.petTypes?.includes(o.value);
              return (
                <Chip
                  key={o.value}
                  on={on}
                  onClick={() => {
                    const cur = filters.petTypes ?? [];
                    const next = on ? cur.filter((t) => t !== o.value) : [...cur, o.value];
                    onChange({ ...filters, petTypes: next.length ? next : undefined });
                  }}
                >
                  {o.label}
                </Chip>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <Heading>Pets and home</Heading>
          <div className="flex flex-wrap gap-2">
            {HOME_OPTIONS.map((o) => (
              <Chip key={String(o.key)} on={!!filters[o.key]} onClick={() => onChange({ ...filters, [o.key]: filters[o.key] ? undefined : true })}>
                {o.label}
              </Chip>
            ))}
          </div>
        </section>

        {isNomad && places.length > 0 && (
          <Switch
            on={mineOn}
            onChange={(on) =>
              onChange({
                ...filters,
                countries: on ? preferred?.preferred_countries ?? undefined : undefined,
                cities: on ? preferred?.preferred_cities ?? undefined : undefined,
              })
            }
            title="Only my places"
            detail={`${places.slice(0, 3).join(", ")}${places.length > 3 ? " and more" : ""} · from your Nomad profile`}
          />
        )}
      </div>
      <div className="flex gap-3 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={() => onChange(clearFilters(filters))} className="flex h-[52px] items-center rounded-2xl px-4 text-[15px] font-bold">
          Clear all
        </button>
        <button type="button" onClick={onDone} className="flex h-[52px] flex-1 items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground">
          {resultCount === null ? "Show sits" : `Show ${resultCount} ${resultCount === 1 ? "sit" : "sits"}`}
        </button>
      </div>
    </div>
  );
};

export const SitFiltersPanel = ({
  open,
  onOpenChange,
  ...body
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ListingFilters;
  onChange: (f: ListingFilters) => void;
  resultCount: number | null;
}) => {
  const isMobile = useIsMobile();
  const done = () => onOpenChange(false);
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-[26px] font-normal">Filters</DrawerTitle>
            <DrawerDescription className="sr-only">Narrow down the sits you see</DrawerDescription>
          </DrawerHeader>
          <PanelBody {...body} onDone={done} />
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-[560px] flex-col gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5 text-left">
          <DialogTitle className="font-display text-[26px] font-normal">Filters</DialogTitle>
          <DialogDescription className="sr-only">Narrow down the sits you see</DialogDescription>
        </DialogHeader>
        <PanelBody {...body} onDone={done} />
      </DialogContent>
    </Dialog>
  );
};

/** Search, Filters (with a count), Saved and List / Map, then the active filters as tags. */
export const SitFilterBar = ({
  filters,
  onChange,
  onOpenFilters,
  viewMode,
  onViewModeChange,
}: {
  filters: ListingFilters;
  onChange: (f: ListingFilters) => void;
  onOpenFilters: () => void;
  viewMode: "grid" | "map";
  onViewModeChange: (m: "grid" | "map") => void;
}) => {
  const { user } = useAuth();
  const tags = activeFilterTags(filters);
  const seg = (mode: "grid" | "map", label: string, Icon: typeof List) => (
    <button
      type="button"
      aria-pressed={viewMode === mode}
      onClick={() => onViewModeChange(mode)}
      className={cn(
        "flex h-11 items-center gap-1.5 rounded-full px-3 text-sm sm:px-4",
        viewMode === mode ? "bg-card font-bold shadow-sm" : "font-semibold text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <LocationSearchInput
          wrapperClassName="w-full lg:flex-1"
          placeholder="Where do you want to go?"
          value={filters.search || ""}
          onChange={(v) => onChange({ ...filters, search: v })}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenFilters}
            className="flex h-11 items-center gap-2 rounded-full border-[1.5px] border-border bg-card px-4 text-sm font-bold"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters
            {tags.length > 0 && (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                {tags.length}
              </span>
            )}
          </button>
          {user && (
            <Link to="/saved" aria-label="Saved" className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-bold hover:bg-muted sm:px-3">
              <Heart className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Saved</span>
            </Link>
          )}
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
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary/15 px-3.5 text-sm font-semibold"
            >
              {t.label}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={() => onChange(clearFilters(filters))} className="min-h-11 px-2 text-sm font-bold underline-offset-2 hover:underline">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};
