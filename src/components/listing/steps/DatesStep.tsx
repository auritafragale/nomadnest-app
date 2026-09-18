import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, CalendarIcon, ChevronDown } from "lucide-react";
import { SitDate, ListingFormData } from "@/hooks/useListingForm";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

interface DatesStepProps {
  formData: ListingFormData;
  addSitDate: () => void;
  updateSitDate: (id: string, data: Partial<SitDate>) => void;
  removeSitDate: (id: string) => void;
  /** Hides the "When do you need a Nomad?" heading/intro, for use as a sub-section elsewhere. */
  showHeading?: boolean;
}

const flexibilityOptions = [
  { value: "fixed", label: "Fixed dates (no flexibility)" },
  { value: "flexible_1_2_days", label: "Flexible by 1-2 days" },
  { value: "flexible_week", label: "Flexible by up to a week" },
  { value: "very_flexible", label: "Very flexible" },
];

const handoverOptions = [
  { value: "flexible", label: "Flexible" },
  { value: "morning", label: "Morning preferred" },
  { value: "afternoon", label: "Afternoon preferred" },
  { value: "evening", label: "Evening preferred" },
  { value: "overlap", label: "Need overlap with sitter" },
];

const DatesStep = ({ formData, addSitDate, updateSitDate, removeSitDate, showHeading = true }: DatesStepProps) => {
  // Every date range starts collapsed; the member clicks to open each one.
  const [expandedDateIds, setExpandedDateIds] = useState<Set<string>>(() => new Set());

  const toggleDateExpanded = (id: string) => {
    setExpandedDateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const dateSummary = (sitDate: SitDate) => {
    if (!sitDate.start_date && !sitDate.end_date) return "Not set yet";
    const start = sitDate.start_date ? format(parseISO(sitDate.start_date), "MMM d, yyyy") : "?";
    const end = sitDate.end_date ? format(parseISO(sitDate.end_date), "MMM d, yyyy") : "?";
    return `${start} – ${end}`;
  };

  const handleRangeSelect = (id: string, range: DateRange | undefined) => {
    updateSitDate(id, {
      start_date: range?.from ? format(range.from, "yyyy-MM-dd") : "",
      end_date: range?.to ? format(range.to, "yyyy-MM-dd") : "",
    });
  };

  return (
    <div className="space-y-6">
      {showHeading && (
        <div className="text-center mb-8">
          <h2 className="text-2xl font-display font-bold text-foreground">
            When do you need a Nomad?
          </h2>
          <p className="text-muted-foreground mt-2">
            Add one or more date ranges for your sit
          </p>
        </div>
      )}

      <div className="space-y-6">
        {formData.sit_dates.map((sitDate, index) => {
          const expanded = expandedDateIds.has(sitDate.id);
          return (
          <Card key={sitDate.id}>
            <Collapsible open={expanded} onOpenChange={() => toggleDateExpanded(sitDate.id)}>
              <CardHeader className="pb-4">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer">
                    <div className="min-w-0">
                      <CardTitle className="text-lg">Date Range {index + 1}</CardTitle>
                      <p className="text-xs text-muted-foreground">{dateSummary(sitDate)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {formData.sit_dates.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSitDate(sitDate.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-muted-foreground transition-transform",
                          expanded && "rotate-180"
                        )}
                      />
                    </div>
                  </div>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Sit Dates *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !sitDate.start_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {sitDate.start_date && sitDate.end_date
                        ? `${format(parseISO(sitDate.start_date), "PPP")} – ${format(parseISO(sitDate.end_date), "PPP")}`
                        : sitDate.start_date
                          ? format(parseISO(sitDate.start_date), "PPP")
                          : "Pick a date range"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={{
                        from: sitDate.start_date ? parseISO(sitDate.start_date) : undefined,
                        to: sitDate.end_date ? parseISO(sitDate.end_date) : undefined,
                      }}
                      onSelect={(range) => handleRangeSelect(sitDate.id, range)}
                      disabled={(date) => date < new Date()}
                      numberOfMonths={2}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date Flexibility</Label>
                  <Select
                    value={sitDate.flexibility}
                    onValueChange={(value) => updateSitDate(sitDate.id, { flexibility: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select flexibility" />
                    </SelectTrigger>
                    <SelectContent>
                      {flexibilityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Handover Preference</Label>
                  <Select
                    value={sitDate.handover_preference}
                    onValueChange={(value) => updateSitDate(sitDate.id, { handover_preference: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select preference" />
                    </SelectTrigger>
                    <SelectContent>
                      {handoverOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
          );
        })}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={addSitDate}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Another Date Range
        </Button>
      </div>
    </div>
  );
};

export default DatesStep;
