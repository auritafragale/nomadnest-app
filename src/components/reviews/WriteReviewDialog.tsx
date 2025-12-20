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
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Star, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

interface WriteReviewDialogProps {
  sitId: string;
  revieweeUserId: string;
  revieweeName: string;
  reviewType: "owner" | "sitter";
  trigger?: React.ReactNode;
  onReviewSubmitted?: () => void;
}

const WriteReviewDialog = ({
  sitId,
  revieweeUserId,
  revieweeName,
  reviewType,
  trigger,
  onReviewSubmitted,
}: WriteReviewDialogProps) => {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = async () => {
    if (!user || rating === 0) return;

    setLoading(true);
    try {
      const { error } = await supabase.from("reviews").insert({
        sit_id: sitId,
        reviewer_user_id: user.id,
        reviewee_user_id: revieweeUserId,
        rating,
        text: text.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Review submitted!",
        description: `Your review for ${revieweeName} has been posted.`,
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["owner-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["sitter-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["sits"] });

      setOpen(false);
      setRating(0);
      setText("");
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

  const displayRating = hoveredRating || rating;

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review {revieweeName}</DialogTitle>
          <DialogDescription>
            Share your experience with this {reviewType === "owner" ? "pet owner" : "sitter"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Star Rating */}
          <div className="space-y-2">
            <Label>Rating</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "w-8 h-8 transition-colors",
                      star <= displayRating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground hover:text-yellow-300"
                    )}
                  />
                </button>
              ))}
            </div>
            {displayRating > 0 && (
              <p className="text-sm text-muted-foreground">
                {displayRating === 1 && "Poor"}
                {displayRating === 2 && "Fair"}
                {displayRating === 3 && "Good"}
                {displayRating === 4 && "Very Good"}
                {displayRating === 5 && "Excellent"}
              </p>
            )}
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
              disabled={loading || rating === 0}
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
