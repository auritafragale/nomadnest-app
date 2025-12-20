import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Calendar, Loader2, Star, User, Sparkles } from "lucide-react";

interface SitDate {
  id: string;
  start_date: string;
  end_date: string;
  flexibility: string | null;
}

interface ApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingTitle: string;
  sitDate: SitDate | null;
  onSuccess?: () => void;
}

const HIGHLIGHT_OPTIONS = [
  "Experienced with this pet type",
  "Flexible schedule",
  "Work from home",
  "Pet first aid trained",
  "Have references",
  "Local to the area",
  "Long-term availability",
  "Previous housesitting experience",
];

export const ApplyDialog = ({
  open,
  onOpenChange,
  listingId,
  listingTitle,
  sitDate,
  onSuccess,
}: ApplyDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [message, setMessage] = useState("");
  const [whoApplying, setWhoApplying] = useState("");
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>([]);
  const [customHighlight, setCustomHighlight] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasExistingApplication, setHasExistingApplication] = useState(false);
  const [checkingApplication, setCheckingApplication] = useState(false);

  // Check for existing application when dialog opens
  useEffect(() => {
    const checkExisting = async () => {
      if (!open || !user || !sitDate) return;

      setCheckingApplication(true);
      const { data, error } = await supabase
        .from("applications")
        .select("id")
        .eq("listing_id", listingId)
        .eq("sit_dates_id", sitDate.id)
        .eq("sitter_user_id", user.id)
        .maybeSingle();

      setHasExistingApplication(!!data && !error);
      setCheckingApplication(false);
    };

    checkExisting();
  }, [open, user, listingId, sitDate]);

  const toggleHighlight = (highlight: string) => {
    setSelectedHighlights((prev) =>
      prev.includes(highlight)
        ? prev.filter((h) => h !== highlight)
        : [...prev, highlight]
    );
  };

  const addCustomHighlight = () => {
    if (customHighlight.trim() && !selectedHighlights.includes(customHighlight.trim())) {
      setSelectedHighlights((prev) => [...prev, customHighlight.trim()]);
      setCustomHighlight("");
    }
  };

  const handleSubmit = async () => {
    if (!user || !sitDate) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("applications").insert({
        listing_id: listingId,
        sit_dates_id: sitDate.id,
        sitter_user_id: user.id,
        message: message.trim() || null,
        who_applying: whoApplying.trim() || null,
        highlights: selectedHighlights.length > 0 ? selectedHighlights : null,
        status: "applied",
      });

      if (error) throw error;

      toast({
        title: "Application sent!",
        description: "The owner will review your application soon.",
      });

      // Reset form
      setMessage("");
      setWhoApplying("");
      setSelectedHighlights([]);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error applying:", error);
      toast({
        title: "Failed to apply",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Apply for this Sit
          </DialogTitle>
          <DialogDescription>
            Send your application for "{listingTitle}"
          </DialogDescription>
        </DialogHeader>

        {checkingApplication ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasExistingApplication ? (
          <div className="py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center mx-auto mb-4">
              <Star className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="font-medium text-foreground mb-2">Already Applied</h3>
            <p className="text-sm text-muted-foreground">
              You've already submitted an application for these dates. The owner will review it soon.
            </p>
          </div>
        ) : (
          <div className="space-y-5 mt-2">
            {/* Selected Dates */}
            {sitDate && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  {format(parseISO(sitDate.start_date), "MMM d")} -{" "}
                  {format(parseISO(sitDate.end_date), "MMM d, yyyy")}
                </div>
                {sitDate.flexibility && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    {sitDate.flexibility.replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
            )}

            {/* Who's Applying */}
            <div className="space-y-2">
              <Label htmlFor="who" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Who's applying?
              </Label>
              <Input
                id="who"
                placeholder="e.g., Solo traveler, Couple, Family..."
                value={whoApplying}
                onChange={(e) => setWhoApplying(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Let the owner know who will be staying
              </p>
            </div>

            {/* Highlights */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                Why you're a great fit
              </Label>
              <div className="flex flex-wrap gap-2">
                {HIGHLIGHT_OPTIONS.map((highlight) => (
                  <Badge
                    key={highlight}
                    variant={selectedHighlights.includes(highlight) ? "default" : "outline"}
                    className="cursor-pointer transition-colors"
                    onClick={() => toggleHighlight(highlight)}
                  >
                    {highlight}
                  </Badge>
                ))}
              </div>
              {/* Custom highlight input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add your own..."
                  value={customHighlight}
                  onChange={(e) => setCustomHighlight(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomHighlight())}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomHighlight}
                  disabled={!customHighlight.trim()}
                >
                  Add
                </Button>
              </div>
              {/* Show custom highlights */}
              {selectedHighlights.filter((h) => !HIGHLIGHT_OPTIONS.includes(h)).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedHighlights
                    .filter((h) => !HIGHLIGHT_OPTIONS.includes(h))
                    .map((highlight) => (
                      <Badge
                        key={highlight}
                        variant="default"
                        className="cursor-pointer"
                        onClick={() => toggleHighlight(highlight)}
                      >
                        {highlight} ×
                      </Badge>
                    ))}
                </div>
              )}
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="message">Your message to the owner</Label>
              <Textarea
                id="message"
                placeholder="Introduce yourself, share your experience with pets, and explain why you'd be a great fit for this sit..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                A personal message helps your application stand out
              </p>
            </div>

            {/* Submit */}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!sitDate || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Application"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
