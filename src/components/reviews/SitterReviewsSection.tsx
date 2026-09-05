import { useSitterReviews, useSitterAverageRating } from "@/hooks/useSitterReviews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, MapPin } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { sortReviews, type ReviewSort } from "@/lib/ratingWeights";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SitterReviewsSectionProps {
  sitterUserId: string;
  sitterFirstName?: string | null;
}

const StarRating = ({ rating }: { rating: number }) => {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${
            star <= rating
              ? "fill-yellow-400 text-yellow-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
};

export const SitterReviewsSection = ({
  sitterUserId,
  sitterFirstName,
}: SitterReviewsSectionProps) => {
  const { data: reviews, isLoading: reviewsLoading } = useSitterReviews(sitterUserId);
  const { data: ratingData, isLoading: ratingLoading } = useSitterAverageRating(sitterUserId);
  const [sort, setSort] = useState<ReviewSort>("recent");

  if (reviewsLoading || ratingLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-primary" />
            Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {sitterFirstName || "This sitter"} hasn't received any reviews yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-primary" />
            Reviews
          </CardTitle>
          {ratingData && ratingData.count > 0 && (
            <div className="flex items-center gap-2">
              <StarRating rating={Math.round(ratingData.average)} />
              <span className="text-sm text-muted-foreground">
                {ratingData.average.toFixed(1)} ({ratingData.count} review
                {ratingData.count !== 1 ? "s" : ""})
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Select value={sort} onValueChange={(v) => setSort(v as ReviewSort)}>
          <SelectTrigger className="w-[170px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="relevant">Most Relevant</SelectItem>
          </SelectContent>
        </Select>
        {sortReviews(reviews, sort).map((review) => {
          const reviewerName = [review.reviewer.first_name, review.reviewer.last_name]
            .filter(Boolean)
            .join(" ") || "Anonymous";
          const initials = reviewerName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
          const location = [review.sit.listing.city, review.sit.listing.country]
            .filter(Boolean)
            .join(", ");

          const breakdown = [
            { label: "Pet Care", value: review.rating_pet_care },
            { label: "Comms", value: review.rating_communication },
            { label: "Cleanliness", value: review.rating_cleanliness },
            { label: "Reliability", value: review.rating_reliability },
            { label: "Respect", value: review.rating_respect_home },
          ].filter((b) => b.value != null);

          return (
            <div key={review.id} className="border-b border-border last:border-0 pb-4 last:pb-0">
              <div className="flex items-start gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={review.reviewer.avatar_url || undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-foreground">{reviewerName}</span>
                    <StarRating rating={review.rating} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span>{format(new Date(review.created_at), "MMM d, yyyy")}</span>
                    {location && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {location}
                        </span>
                      </>
                    )}
                  </div>
                  {breakdown.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
                      {breakdown.map((b) => (
                        <span key={b.label} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {b.label}
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          {b.value}
                        </span>
                      ))}
                    </div>
                  )}
                  {review.text && (
                    <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                      {review.text}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
