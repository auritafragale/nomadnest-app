import { useEffect, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { formatPetType, PET_TYPE_OPTIONS } from "@/lib/petTypes";

export type SortKey = "recent" | "reviews" | "rating";
export type PlaceKey = "any" | "local" | "international";

export interface ApplicationFilters {
  sortKey: SortKey;
  placeKey: PlaceKey;
  petFilter: string;
  sitDatesId: string;
}

export const defaultApplicationFilters: ApplicationFilters = {
  sortKey: "recent",
  placeKey: "any",
  petFilter: "any",
  sitDatesId: "all",
};

export const applicationFiltersActive = (f: ApplicationFilters) =>
  f.sortKey !== "recent" ||
  f.placeKey !== "any" ||
  f.petFilter !== "any" ||
  f.sitDatesId !== "all";

interface DateOption {
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  filters: ApplicationFilters;
  dateOptions: DateOption[];
  onApply: (filters: ApplicationFilters) => void;
}

const Pill = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-background text-foreground border-border hover:bg-muted"
    }`}
  >
    {children}
  </button>
);

const ApplicationFilterSheet = ({ open, onClose, filters, dateOptions, onApply }: Props) => {
  const [draft, setDraft] = useState<ApplicationFilters>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>Filters</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-2 overflow-y-auto space-y-5">
          <div>
            <p className="text-sm font-medium mb-2">Sort by</p>
            <div className="flex flex-wrap gap-2">
              {([
                ["recent", "Most recent"],
                ["reviews", "Most reviews"],
                ["rating", "Highest rating"],
              ] as [SortKey, string][]).map(([key, label]) => (
                <Pill
                  key={key}
                  active={draft.sortKey === key}
                  onClick={() => setDraft((d) => ({ ...d, sortKey: key }))}
                >
                  {label}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Where the Nomad is based</p>
            <div className="flex flex-wrap gap-2">
              {([
                ["any", "Anywhere"],
                ["local", "Local Nomads"],
                ["international", "International Nomads"],
              ] as [PlaceKey, string][]).map(([key, label]) => (
                <Pill
                  key={key}
                  active={draft.placeKey === key}
                  onClick={() => setDraft((d) => ({ ...d, placeKey: key }))}
                >
                  {label}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Animal experience</p>
            <div className="flex flex-wrap gap-2">
              <Pill
                active={draft.petFilter === "any"}
                onClick={() => setDraft((d) => ({ ...d, petFilter: "any" }))}
              >
                Any
              </Pill>
              {PET_TYPE_OPTIONS.map((t) => (
                <Pill
                  key={t}
                  active={draft.petFilter === t}
                  onClick={() => setDraft((d) => ({ ...d, petFilter: t }))}
                >
                  {formatPetType(t)}
                </Pill>
              ))}
            </div>
          </div>

          {dateOptions.length > 1 && (
            <div>
              <p className="text-sm font-medium mb-2">Sit dates</p>
              <div className="flex flex-wrap gap-2">
                <Pill
                  active={draft.sitDatesId === "all"}
                  onClick={() => setDraft((d) => ({ ...d, sitDatesId: "all" }))}
                >
                  All dates
                </Pill>
                {dateOptions.map((o) => (
                  <Pill
                    key={o.id}
                    active={draft.sitDatesId === o.id}
                    onClick={() => setDraft((d) => ({ ...d, sitDatesId: o.id }))}
                  >
                    {o.label}
                  </Pill>
                ))}
              </div>
            </div>
          )}
        </div>

        <DrawerFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setDraft(defaultApplicationFilters)}
          >
            Clear all
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default ApplicationFilterSheet;
