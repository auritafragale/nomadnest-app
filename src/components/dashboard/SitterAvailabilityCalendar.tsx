import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Save, Loader2, X } from "lucide-react";
import { useSitterPreferences } from "@/hooks/useSitterPreferences";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format, isWithinInterval, startOfDay, endOfDay, eachDayOfInterval, isSameDay } from "date-fns";
import { DateRange } from "react-day-picker";

export const SitterAvailabilityCalendar = () => {
  const { user } = useAuth();
  const { data: preferences, isLoading, refetch } = useSitterPreferences();
  const { toast } = useToast();
  
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  // Parse existing availability dates
  const availableFrom = preferences?.available_from ? new Date(preferences.available_from) : null;
  const availableTo = preferences?.available_to ? new Date(preferences.available_to) : null;

  const handleSaveAvailability = async () => {
    if (!user || !selectedRange?.from) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("sitter_profiles")
        .update({
          available_from: selectedRange.from.toISOString().split("T")[0],
          available_to: selectedRange.to?.toISOString().split("T")[0] || selectedRange.from.toISOString().split("T")[0],
          availability_type: "dates",
        })
        .eq("user_id", user.id);

      if (error) throw error;

      await refetch();
      setSelectedRange(undefined);

      toast({
        title: "Availability saved",
        description: "Your availability has been updated.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save availability.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearAvailability = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("sitter_profiles")
        .update({
          available_from: null,
          available_to: null,
          availability_type: "flexible",
        })
        .eq("user_id", user.id);

      if (error) throw error;

      await refetch();

      toast({
        title: "Availability cleared",
        description: "Your availability has been set to flexible.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to clear availability.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate days in current availability range
  const availabilityDays = availableFrom && availableTo
    ? eachDayOfInterval({ start: availableFrom, end: availableTo })
    : [];

  // Custom modifier for highlighting available days
  const modifiers = {
    available: (day: Date) => {
      if (!availableFrom || !availableTo) return false;
      return isWithinInterval(day, { 
        start: startOfDay(availableFrom), 
        end: endOfDay(availableTo) 
      });
    },
  };

  const modifiersStyles = {
    available: {
      backgroundColor: "hsl(var(--primary) / 0.15)",
      color: "hsl(var(--primary))",
      fontWeight: 600,
    },
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">My Availability</CardTitle>
          </div>
          {(availableFrom || availableTo) && (
            <Badge variant="secondary">
              {preferences?.availability_type === "flexible" ? "Flexible" : "Set dates"}
            </Badge>
          )}
        </div>
        <CardDescription>
          Select your available dates. Owners can see when you're open for sits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current availability display */}
        {availableFrom && availableTo && (
          <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
            <div className="text-sm">
              <span className="text-muted-foreground">Available: </span>
              <span className="font-medium">
                {format(availableFrom, "MMM d, yyyy")} - {format(availableTo, "MMM d, yyyy")}
              </span>
              <span className="text-muted-foreground ml-2">
                ({availabilityDays.length} days)
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAvailability}
              disabled={isSaving}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Calendar */}
        <div className="flex justify-center">
          <Calendar
            mode="range"
            selected={selectedRange}
            onSelect={setSelectedRange}
            numberOfMonths={1}
            disabled={{ before: new Date() }}
            modifiers={modifiers}
            modifiersStyles={modifiersStyles}
            className="rounded-md border"
          />
        </div>

        {/* Selected range preview */}
        {selectedRange?.from && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="text-sm">
              <span className="text-muted-foreground">Selected: </span>
              <span className="font-medium">
                {format(selectedRange.from, "MMM d, yyyy")}
                {selectedRange.to && ` - ${format(selectedRange.to, "MMM d, yyyy")}`}
              </span>
            </div>
            <Button
              size="sm"
              onClick={handleSaveAvailability}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </>
              )}
            </Button>
          </div>
        )}

        {/* Help text */}
        <p className="text-xs text-muted-foreground text-center">
          Click and drag to select a date range, then click Save.
        </p>
      </CardContent>
    </Card>
  );
};
