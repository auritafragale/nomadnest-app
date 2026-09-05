import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Star, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendNotification } from "@/lib/notifications";
import { HOME_FLAG_QUESTIONS, NOMAD_FLAG_QUESTIONS } from "@/lib/trustFlags";

interface WriteReviewDialogProps {
  sitId: string;
  revieweeUserId: string;
  revieweeName: string;
  reviewType: "owner" | "sitter";
  trigger?: React.ReactNode;
  onReviewSubmitted?: () => void;
}

type CategoryKey =
  | "rating_pet_care"
  | "rating_communication"
  | "rating_cleanliness"
  | "rating_reliability"
  | "rating_respect_home"
  | "rating_home_accuracy"
  | "rating_pet_preparedness"
  | "rating_hospitality"
  | "rating_clear_expectations";

interface CategoryDef {
  key: CategoryKey;
  label: string;
}

const NOMAD_CATEGORIES: CategoryDef[] = [
  { key: "rating_pet_care", label: "Pet Care & Attention" },
  { key: "rating_communication", label: "Communication" },
  { key: "rating_cleanliness", label: "Cleanliness & Tidiness" },
  { key: "rating_reliability", label: "Reliability" },
  { key: "rating_respect_home", label: "Respect for Home" },
];

const OWNER_CATEGORIES: CategoryDef[] = [
  { key: "rating_communication", label: "Communication" },
  { key: "rating_home_accuracy", label: "Home Accuracy" },
  { key: "rating_pet_preparedness", label: "Pet Preparedness" },
  { key: "rating_hospitality", label: "Hospitality & Cleanliness" },
  { key: "rating_clear_expectations", label: "Clear Expectations" },
];

const WriteReviewDialog = ({
  sitId,
  revieweeUserId,
  revieweeName,
  reviewType,
  trigger,
  onReviewSubmitted,
}: WriteReviewDialogProps) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [ratings, setRatings] = useState<Record<CategoryKey, number>>({
    rating_pet_care: 0,
    rating_communication: 0,
    rating_cleanliness: 0,
    rating_reliability: 0,
    rating_respect_home: 0,
    rating_home_accuracy: 0,
    rating_pet_preparedness: 0,
    rating_hospitality: 0,
    rating_clear_expectations: 0,
  });
  const [hovered, setHovered] = useState<{ key: CategoryKey | null; value: number }>({
    key: null,
    value: 0,
  });
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const categories = reviewType === "sitter" ? NOMAD_CATEGORIES : OWNER_CATEGORIES;
  const allRated = categories.every((c) => ratings[c.key] > 0);

  // `reviewType === "sitter"` means a Pet Parent is reviewing a Nomad.
  const flagQuestions = reviewType === "sitter" ? NOMAD_FLAG_QUESTIONS : HOME_FLAG_QUESTIONS;
  const [flagAnswers, setFlagAnswers] = useState<Record<string, "yes" | "no" | undefined>>({});
  const flagPayload = () => {
    const payload: Record<string, boolean> = {};
    for (const q of flagQuestions) {
      const answer = flagAnswers[q.column];
      if (!answer) continue;
      // A flag is raised when the unhealthy answer is given.
      payload[q.column] = q.yesIsGood ? answer === "no" : answer === "yes";
    }
    return payload;
  };

  const handleSubmit = async () => {
    if (!user || !allRated) return;

    setLoading(true);
    try {
      const values = categories.map((c) => ratings[c.key]);
      const overallRating = Math.round(
        values.reduce((sum, v) => sum + v, 0) / values.length
      );

      const insertPayload: Record<string, unknown> = {
        sit_id: sitId,
        reviewer_user_id: user.id,
        reviewee_user_id: revieweeUserId,
        rating: overallRating,
        text: text.trim() || null,
      };
      for (const c of categories) {
        insertPayload[c.key] = ratings[c.key];
      }
      Object.assign(insertPayload, flagPayload());

      const { error } = await supabase
        .from("reviews")
        .insert(insertPayload as never);

      if (error) throw error;

      // Get reviewer name for notification
      const { data: reviewerProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single();

      // Send notification to reviewee
      sendNotification({
        type: "review",
        recipientUserId: revieweeUserId,
        data: {
          reviewerName: [reviewerProfile?.first_name, reviewerProfile?.last_name].filter(Boolean).join(" ") || "Someone",
          rating: overallRating.toString(),
          text: text.trim() || "",
        },
      });

      toast({
        title: "Review submitted!",
        description: `Your review for ${revieweeName} has been posted.`,
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["owner-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["sitter-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["sits"] });

      setOpen(false);
      setText("");
      setRatings({
        rating_pet_care: 0,
        rating_communication: 0,
        rating_cleanliness: 0,
        rating_reliability: 0,
        rating_respect_home: 0,
        rating_home_accuracy: 0,
        rating_pet_preparedness: 0,
        rating_hospitality: 0,
        rating_clear_expectations: 0,
      });
      onReviewSubmitted?.();
    } catch (error: any) {
      console.error("Error submitting review:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit review. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const displayValue = (key: CategoryKey) =>
    hovered.key === key && hovered.value > 0 ? hovered.value : ratings[key];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <PenLine className="w-4 h-4" />
            Write Review
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review {revieweeName}</DialogTitle>
          <DialogDescription>
            Rate your experience with this {reviewType === "owner" ? "Pet Parent" : "Nomad"} across the categories below.
            <span className="inline-flex align-middle ml-1">
              <HelpTooltip
                label="About the review window"
                content="Reviews are open for 14 days after the sit ends. After that, the sit auto-completes and reviews close."
              />
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Category Ratings */}
          <div className="space-y-4">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-semibold">Category Ratings</Label>
              <HelpTooltip
                label="About sub-ratings"
                content="Each category scores a different aspect of the sit. Your overall rating is the average of these."
              />
            </div>
            {categories.map((category) => {
              const value = displayValue(category.key);
              return (
                <div key={category.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">{category.label}</Label>
                    <span className="text-xs text-muted-foreground">
                      {value > 0 &&
                        ["", "Poor", "Fair", "Good", "Very Good", "Excellent"][value]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() =>
                          setRatings((prev) => ({ ...prev, [category.key]: star }))
                        }
                        onMouseEnter={() =>
                          setHovered({ key: category.key, value: star })
                        }
                        onMouseLeave={() => setHovered({ key: null, value: 0 })}
                        className="p-0.5 transition-transform hover:scale-110"
                        aria-label={`Rate ${category.label} ${star} out of 5`}
                      >
                        <Star
                          className={cn(
                            "w-6 h-6 transition-colors",
                            star <= value
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground hover:text-yellow-300"
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Private community questions — never shown publicly */}
          <div className="space-y-4">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm font-semibold">Private questions</Label>
              <HelpTooltip
                label="About private questions"
                content="These answers are never shown on anyone's profile. They only help our community team spot repeated patterns."
              />
            </div>
            {flagQuestions.map((q) => {
              const answer = flagAnswers[q.column];
              return (
                <div key={q.column} className="space-y-1.5">
                  <Label className="text-sm font-medium">{q.question}</Label>
                  <div className="flex gap-2">
                    {(["yes", "no"] as const).map((option) => (
                      <Button
                        key={option}
                        type="button"
                        size="sm"
                        variant={answer === option ? "default" : "outline"}
                        className="flex-1 capitalize"
                        onClick={() =>
                          setFlagAnswers((prev) => ({ ...prev, [q.column]: option }))
                        }
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>



          {/* Review Text */}
          <div className="space-y-2">
            <Label htmlFor="review-text">Your Review (optional)</Label>
            <Textarea
              id="review-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Tell others about your experience with ${revieweeName}...`}
              rows={4}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {text.length}/1000
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={loading || !allRated}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Star className="w-4 h-4 mr-2" />
              )}
              Submit Review
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WriteReviewDialog;
