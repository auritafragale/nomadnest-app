import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

const petOptions = ["Dog", "Cat", "Bird", "Fish", "Rabbit", "Other"];




export interface MobileFilters {
  lastMinute: boolean;
  reasons: string[];
  petTypes: string[];
  dateRange?: DateRange;
}

interface FilterBottomSheetProps {
  open: boolean;
  onClose: () => void;
  filters: MobileFilters;
  onApply: (filters: MobileFilters) => void;
}

const FilterBottomSheet = ({ open, onClose, filters, onApply }: FilterBottomSheetProps) => {
  const [draft, setDraft] = useState<MobileFilters>(filters);

  const toggleReason = (v: string) => {
    setDraft((d) => ({
      ...d,
      reasons: d.reasons.includes(v) ? d.reasons.filter((r) => r !== v) : [...d.reasons, v],
    }));
  };

  const togglePet = (v: string) => {
    setDraft((d) => ({
      ...d,
      petTypes: d.petTypes.includes(v) ? d.petTypes.filter((p) => p !== v) : [...d.petTypes, v],
    }));
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const handleClear = () => {
    const empty: MobileFilters = { lastMinute: false, reasons: [], petTypes: [], dateRange: undefined };
    setDraft(empty);
    onApply(empty);
    onClose();
  };

  const activeCount =
    (draft.lastMinute ? 1 : 0) +
    draft.reasons.length +
    draft.petTypes.length +
    (draft.dateRange?.from ? 1 : 0);

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[85svh]">
        <DrawerHeader className="flex items-center justify-between">
          <DrawerTitle>Filters</DrawerTitle>
          <DrawerClose asChild>
            <button className="p-1 text-muted-foreground">
              <X className="w-5 h-5" />
            </button>
          </DrawerClose>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 space-y-6 pb-2">
          {/* Last Minute */}
          <div>
            <button
              onClick={() => setDraft((d) => ({ ...d, lastMinute: !d.lastMinute }))}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-colors",
                draft.lastMinute ? "border-[#E8735A] bg-[#E8735A]/10" : "border-border"
              )}
            >
              <div className="text-left">
                <p className="font-semibold">Last Minute</p>
                <p className="text-sm text-muted-foreground">Sits starting within 2 weeks</p>
              </div>
              <div
                className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                  draft.lastMinute ? "border-[#E8735A] bg-[#E8735A]" : "border-muted-foreground"
                )}
              >
                {draft.lastMinute && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          </div>




          {/* Pet Types */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3">Pet Type</p>
            <div className="flex flex-wrap gap-2">
              {petOptions.map((pet) => (
                <button
                  key={pet}
                  onClick={() => togglePet(pet)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors",
                    draft.petTypes.includes(pet)
                      ? "border-[#E8735A] bg-[#E8735A] text-white"
                      : "border-border text-foreground"
                  )}
                >
                  {pet}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3">Date Range</p>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                  {draft.dateRange?.from ? (
                    draft.dateRange.to ? (
                      `${format(draft.dateRange.from, "MMM d")} – ${format(draft.dateRange.to, "MMM d, yyyy")}`
                    ) : (
                      format(draft.dateRange.from, "MMM d, yyyy")
                    )
                  ) : (
                    <span className="text-muted-foreground">Pick dates</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={draft.dateRange}
                  onSelect={(r) => setDraft((d) => ({ ...d, dateRange: r }))}
                  numberOfMonths={1}
                  disabled={{ before: new Date() }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DrawerFooter className="flex-row gap-3 pt-4">
          <Button variant="outline" className="flex-1" onClick={handleClear}>
            Clear{activeCount > 0 ? ` (${activeCount})` : ""}
          </Button>
          <Button
            className="flex-1"
            style={{ backgroundColor: "#E8735A", color: "white" }}
            onClick={handleApply}
          >
            Apply
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default FilterBottomSheet;
