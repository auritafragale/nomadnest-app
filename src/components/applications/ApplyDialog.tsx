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
import { Calendar, Loader2, Star, User, Sparkles, Lock } from "lucide-react";
import { sendNotification } from "@/lib/notifications";
import { useMembership } from "@/hooks/useMembership";
import { useVerification } from "@/hooks/useVerification";
import { useNavigate } from "react-router-dom";

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
  /** All date ranges the nomad selected — one application is created per range. */
  sitDates: SitDate[];
  onSuccess?: () => void;
}

const MAX_ACTIVE_APPLICANTS = 5;

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
  sitDates,
  onSuccess,
}: ApplyDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hasAccess, loading: membershipLoading } = useMembership();
  const { data: verificationData, isLoading: verificationLoading } = useVerification();

  const [message, setMessage] = useState("");
  const [whoApplying, setWhoApplying] = useState("");
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>([]);
  const [customHighlight, setCustomHighlight] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState<Set<string>>(new Set());
  const [fullDates, setFullDates] = useState<Set<string>>(new Set());
  const [checkingApplication, setCheckingApplication] = useState(false);

  const applicableDates = sitDates.filter(
    (d) => !alreadyApplied.has(d.id) && !fullDates.has(d.id),
  );
  const hasExistingApplication = sitDates.length > 0 && applicableDates.length === 0;

  // Check for existing applications / full rounds when dialog opens
  useEffect(() => {
    const checkExisting = async () => {
      if (!open || !user || sitDates.length === 0) return;

      setCheckingApplication(true);
      const ids = sitDates.map((d) => d.id);

      const { data: mine } = await supabase
        .from("applications")
        .select("sit_dates_id")
        .eq("listing_id", listingId)
        .eq("sitter_user_id", user.id)
        .in("sit_dates_id", ids);

      const { data: active } = await supabase
        .from("applications")
        .select("sit_dates_id")
        .in("sit_dates_id", ids)
        .in("status", ["applied", "shortlisted"]);

      const counts = new Map<string, number>();
      (active || []).forEach((a) => {
        counts.set(a.sit_dates_id, (counts.get(a.sit_dates_id) || 0) + 1);
      });

      setAlreadyApplied(new Set((mine || []).map((a) => a.sit_dates_id)));
      setFullDates(new Set(ids.filter((id) => (counts.get(id) || 0) >= MAX_ACTIVE_APPLICANTS)));
      setCheckingApplication(false);
    };

    checkExisting();
  }, [open, user, listingId, sitDates]);

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
    if (!user || applicableDates.length === 0) return;
    if (!message.trim()) {
      toast({
        title: "Message required",
        description: "Please introduce yourself to the Pet Parent before applying.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // One application row per selected date range.
      const { error } = await supabase.from("applications").insert(
        applicableDates.map((d) => ({
          listing_id: listingId,
          sit_dates_id: d.id,
          sitter_user_id: user.id,
          message: message.trim(),
          who_applying: whoApplying.trim() || null,
          highlights: selectedHighlights.length > 0 ? selectedHighlights : null,
          status: "applied" as const,
        })),
      );

      if (error) throw error;

      const { data: listing } = await supabase
        .from("listings")
        .select("owner_user_id")
        .eq("id", listingId)
        .single();

      const { data: sitterProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single();

      if (listing?.owner_user_id) {
        applicableDates.forEach((d) => {
          sendNotification({
            type: "new_application",
            recipientUserId: listing.owner_user_id,
            data: {
              listingTitle,
              sitterName:
                [sitterProfile?.first_name, sitterProfile?.last_name]
                  .filter(Boolean)
                  .join(" ") || "A nomad",
              startDate: format(parseISO(d.start_date), "MMM d, yyyy"),
              endDate: format(parseISO(d.end_date), "MMM d, yyyy"),
            },
          });
        });
      }

      toast({
        title:
          applicableDates.length > 1
            ? `${applicableDates.length} applications sent!`
            : "Application sent!",
        description: "The Pet Parent will review your application soon.",
      });

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
          {!membershipLoading && !hasAccess("sitter") ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Lock className="w-10 h-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Nomad Membership Required</h3>
              <p className="text-muted-foreground mb-6">You need an active Nomad or Combined membership to apply for sits.</p>
              <Button onClick={() => { onOpenChange(false); navigate("/membership"); }}>View Membership Plans</Button>
            </div>
          ) : !verificationLoading && !verificationData?.id_verified ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Lock className="w-10 h-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Identity Verification Required</h3>
              <p className="text-muted-foreground mb-6">You need to verify your identity before applying for sits. It only takes 5 minutes.</p>
              <Button onClick={() => { onOpenChange(false); navigate("/verify-identity"); }}>Verify My Identity</Button>
            </div>
          ) : (
          <>
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
            <h3 className="font-medium text-foreground mb-2">Not available</h3>
            <p className="text-sm text-muted-foreground">
              You've already applied for these dates, or this round already has
              {" "}{MAX_ACTIVE_APPLICANTS} nomads under review. Try other dates or check back soon.
            </p>
          </div>
        ) : (
          <div className="space-y-5 mt-2">
            {/* Selected Dates — one application is sent per range */}
            <div className="space-y-2">
              {applicableDates.map((d) => (
                <div
                  key={d.id}
                  className="p-3 rounded-lg bg-primary/5 border border-primary/20"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Calendar className="h-4 w-4 text-primary" />
                    {format(parseISO(d.start_date), "MMM d")} -{" "}
                    {format(parseISO(d.end_date), "MMM d, yyyy")}
                  </div>
                  {d.flexibility && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      {d.flexibility.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>
              ))}
              {applicableDates.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  A separate application is sent for each date range.
                </p>
              )}
            </div>

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
              <Label htmlFor="message">
                Your message to the Pet Parent <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="message"
                placeholder="Introduce yourself, share your experience with pets, and explain why you'd be a great fit for this sit..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                A personal message is required — it helps your application stand out
              </p>
            </div>

            {/* Submit */}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={applicableDates.length === 0 || !message.trim() || isSubmitting}
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
          </>
          )}
      </DialogContent>
    </Dialog>
  );
};
