import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, User, MapPin } from "lucide-react";
import { useOwnerReviews } from "@/hooks/useOwnerReviews";
import { format } from "date-fns";

interface OwnerReviewsSectionProps {
  ownerUserId: string;
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
              : "text-muted-foreground"
          }`}
        />
      ))}
    </div>
  );
};

const OwnerReviewsSection = ({ ownerUserId }: OwnerReviewsSectionProps) => {
  const { data: reviews = [], isLoading } = useOwnerReviews(ownerUserId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            Reviews from Nomads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (reviews.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            Reviews from Nomads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-6">
            No reviews yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="w-5 h-5" />
          Reviews from Nomads ({reviews.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {reviews.map((review) => {
          const breakdown = [
            { label: "Comms", value: review.rating_communication },
            { label: "Home Accuracy", value: review.rating_home_accuracy },
            { label: "Pet Prep", value: review.rating_pet_preparedness },
            { label: "Hospitality", value: review.rating_hospitality },
            { label: "Expectations", value: review.rating_clear_expectations },
          ].filter((b) => b.value != null);

          return (
            <div key={review.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="flex items-start gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={review.reviewer?.avatar_url || undefined} />
                  <AvatarFallback>
                    <User className="w-5 h-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {review.reviewer?.first_name} {review.reviewer?.last_name}
                      </p>
                      {review.sit?.listing && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {review.sit.listing.city}, {review.sit.listing.country}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <StarRating rating={review.rating} />
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(review.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  {breakdown.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
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
                    <p className="mt-2 text-sm text-foreground">{review.text}</p>
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

export default OwnerReviewsSection;
