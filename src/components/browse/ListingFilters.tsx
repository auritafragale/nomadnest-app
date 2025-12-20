import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, SlidersHorizontal, Grid, List, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { ListingFilters as FilterType } from "@/hooks/useListings";
import { DateRange } from "react-day-picker";

interface ListingFiltersProps {
  filters: FilterType;
  onFiltersChange: (filters: FilterType) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
}

const petTypeOptions = [
  { value: "dog", label: "Dogs" },
  { value: "cat", label: "Cats" },
  { value: "bird", label: "Birds" },
  { value: "fish", label: "Fish" },
  { value: "rabbit", label: "Rabbits" },
  { value: "other", label: "Other" },
];

const ListingFilters = ({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
}: ListingFiltersProps) => {
  const dateRange: DateRange | undefined =
    filters.startDate || filters.endDate
      ? {
          from: filters.startDate ? new Date(filters.startDate) : undefined,
          to: filters.endDate ? new Date(filters.endDate) : undefined,
        }
      : undefined;

  const handleDateChange = (range: DateRange | undefined) => {
    onFiltersChange({
      ...filters,
      startDate: range?.from ? format(range.from, "yyyy-MM-dd") : undefined,
      endDate: range?.to ? format(range.to, "yyyy-MM-dd") : undefined,
    });
  };

  const handlePetTypeToggle = (type: string) => {
    const currentTypes = filters.petTypes || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];
    onFiltersChange({ ...filters, petTypes: newTypes.length > 0 ? newTypes : undefined });
  };

  const clearFilters = () => {
    onFiltersChange({ search: filters.search });
  };

  const hasActiveFilters = filters.petTypes?.length || filters.startDate || filters.endDate;

  return (
    <div className="bg-surface border-b border-border sticky top-16 z-40">
      <div className="container py-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by location or title..."
              className="pl-10 h-12"
              value={filters.search || ""}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
            {/* Date Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 md:flex-none">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}`
                    ) : (
                      format(dateRange.from, "MMM d, yyyy")
                    )
                  ) : (
                    "Dates"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={handleDateChange}
                  numberOfMonths={2}
                  disabled={{ before: new Date() }}
                />
              </PopoverContent>
            </Popover>

            {/* Pet Type Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 md:flex-none">
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Pet Types
                  {filters.petTypes?.length ? ` (${filters.petTypes.length})` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="start">
                <div className="space-y-3">
                  <p className="font-medium text-sm">Filter by pet type</p>
                  {petTypeOptions.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={option.value}
                        checked={filters.petTypes?.includes(option.value) || false}
                        onCheckedChange={() => handlePetTypeToggle(option.value)}
                      />
                      <label
                        htmlFor={option.value}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => onViewModeChange("grid")}
                className={`p-2.5 ${viewMode === "grid" ? "bg-muted" : "bg-surface hover:bg-muted/50"}`}
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => onViewModeChange("list")}
                className={`p-2.5 ${viewMode === "list" ? "bg-muted" : "bg-surface hover:bg-muted/50"}`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListingFilters;
