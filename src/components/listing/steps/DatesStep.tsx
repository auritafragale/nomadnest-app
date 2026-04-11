import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, CalendarIcon } from "lucide-react";
import { SitDate, ListingFormData } from "@/hooks/useListingForm";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface DatesStepProps {
  formData: ListingFormData;
  addSitDate: () => void;
  updateSitDate: (id: string, data: Partial<SitDate>) => void;
  removeSitDate: (id: string) => void;
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

const DatesStep = ({ formData, addSitDate, updateSitDate, removeSitDate }: DatesStepProps) => {
  const handleStartDateSelect = (id: string, date: Date | undefined) => {
    if (date) {
      updateSitDate(id, { start_date: format(date, "yyyy-MM-dd") });
    }
  };

  const handleEndDateSelect = (id: string, date: Date | undefined) => {
    if (date) {
      updateSitDate(id, { end_date: format(date, "yyyy-MM-dd") });
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground">
          When do you need a Nomad?
        </h2>
        <p className="text-muted-foreground mt-2">
          Add one or more date ranges for your sit
        </p>
      </div>

      <div className="space-y-6">
        {formData.sit_dates.map((sitDate, index) => (
          <Card key={sitDate.id}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Date Range {index + 1}</CardTitle>
                {formData.sit_dates.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeSitDate(sitDate.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Start Date */}
                <div className="space-y-2">
                  <Label>Start Date *</Label>
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
                        {sitDate.start_date
                          ? format(parseISO(sitDate.start_date), "PPP")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={sitDate.start_date ? parseISO(sitDate.start_date) : undefined}
                        onSelect={(date) => handleStartDateSelect(sitDate.id, date)}
                        disabled={(date) => date < new Date()}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* End Date */}
                <div className="space-y-2">
                  <Label>End Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !sitDate.end_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {sitDate.end_date
                          ? format(parseISO(sitDate.end_date), "PPP")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={sitDate.end_date ? parseISO(sitDate.end_date) : undefined}
                        onSelect={(date) => handleEndDateSelect(sitDate.id, date)}
                        disabled={(date) => {
                          const startDate = sitDate.start_date
                            ? parseISO(sitDate.start_date)
                            : new Date();
                          return date < startDate;
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
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
          </Card>
        ))}

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
