import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, SlidersHorizontal, Grid, Map, CalendarIcon, X, MapPin, Heart, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import { ListingFilters as FilterType } from "@/hooks/useListings";
import { DateRange } from "react-day-picker";
import { useAuth } from "@/contexts/AuthContext";
import { useSitterPreferredLocations } from "@/hooks/useSitterPreferences";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

interface ListingFiltersProps {
  filters: FilterType;
  onFiltersChange: (filters: FilterType) => void;
  viewMode: "grid" | "map";
  onViewModeChange: (mode: "grid" | "map") => void;
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
  const { user, role } = useAuth();
  const { data: preferredLocations } = useSitterPreferredLocations();

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

  const applyPreferredLocations = () => {
    if (!preferredLocations) return;
    onFiltersChange({
      ...filters,
      countries: preferredLocations.preferred_countries || undefined,
      cities: preferredLocations.preferred_cities || undefined,
    });
  };

  const clearFilters = () => {
    onFiltersChange({ search: filters.search });
  };

  const hasActiveFilters = filters.petTypes?.length || filters.startDate || filters.endDate || filters.countries?.length || filters.cities?.length;
  const hasPreferredLocations = preferredLocations && (
    (preferredLocations.preferred_countries?.length || 0) > 0 ||
    (preferredLocations.preferred_cities?.length || 0) > 0
  );
  const isPreferredLocationsActive = filters.countries?.length || filters.cities?.length;

  return (
    <div className="bg-surface border-b border-border sticky top-16 z-40">
      <div className="container py-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by location, title, or description..."
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

            {/* Sort By */}
            <Select
              value={filters.sortBy || "newest"}
              onValueChange={(value) => 
                onFiltersChange({ ...filters, sortBy: value as "newest" | "soonest" })
              }
            >
              <SelectTrigger className="w-[140px]">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="soonest">Soonest</SelectItem>
              </SelectContent>
            </Select>

            {/* My Locations Filter - for nomads */}
            {user && (role === "sitter" || role === "both") && hasPreferredLocations && (
              <Button
                variant={isPreferredLocationsActive ? "default" : "outline"}
                className="flex-1 md:flex-none"
                onClick={applyPreferredLocations}
              >
                <MapPin className="w-4 h-4 mr-2" />
                My Locations
              </Button>
            )}

            {/* Saved Listings Link */}
            {user && (
              <Link to="/saved">
                <Button variant="ghost" className="flex-1 md:flex-none">
                  <Heart className="w-4 h-4 mr-2" />
                  Saved
                </Button>
              </Link>
            )}

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}

            {/* View Mode Toggle: Grid / Map */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => onViewModeChange("grid")}
                className={`p-2.5 ${viewMode === "grid" ? "bg-muted" : "bg-surface hover:bg-muted/50"}`}
                title="Grid view"
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => onViewModeChange("map")}
                className={`p-2.5 ${viewMode === "map" ? "bg-muted" : "bg-surface hover:bg-muted/50"}`}
                title="Map view"
              >
                <Map className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Active location filters display */}
        {(filters.countries?.length || filters.cities?.length) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {filters.countries?.map((country) => (
              <Badge key={country} variant="secondary" className="gap-1">
                <MapPin className="w-3 h-3" />
                {country}
                <button
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      countries: filters.countries?.filter((c) => c !== country),
                    })
                  }
                  className="ml-1 hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            {filters.cities?.map((city) => (
              <Badge key={city} variant="secondary" className="gap-1">
                <MapPin className="w-3 h-3" />
                {city}
                <button
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      cities: filters.cities?.filter((c) => c !== city),
                    })
                  }
                  className="ml-1 hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ListingFilters;
