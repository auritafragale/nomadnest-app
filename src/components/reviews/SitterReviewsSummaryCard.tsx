import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, ChevronRight } from "lucide-react";
import { useSitterAverageRating } from "@/hooks/useSitterReviews";

interface SitterReviewsSummaryCardProps {
  sitterUserId: string;
}

const SitterReviewsSummaryCard = ({ sitterUserId }: SitterReviewsSummaryCardProps) => {
  const { data: ratingData } = useSitterAverageRating(sitterUserId);
  const average = ratingData?.average ?? 0;
  const count = ratingData?.count ?? 0;

  return (
    <Link to={`/sitter/${sitterUserId}/reviews`} className="block group">
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="w-5 h-5" />
            Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            {count > 0 ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= Math.round(average)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  ))}
                </div>
                <span className="font-semibold">{average.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">
                  ({count} review{count === 1 ? "" : "s"})
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No reviews yet</p>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default SitterReviewsSummaryCard;
