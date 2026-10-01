import { Link } from "react-router-dom";
import { ChevronRight, Star } from "lucide-react";
import { useOwnerAverageRating } from "@/hooks/useOwnerReviews";

interface OwnerReviewsSummaryCardProps {
  ownerUserId: string;
}

/** "★ 4.9 · 12 reviews from Nomads", linking to the Pet Parent's reviews. */
const OwnerReviewsSummaryCard = ({ ownerUserId }: OwnerReviewsSummaryCardProps) => {
  const { averageRating, reviewCount } = useOwnerAverageRating(ownerUserId);

  return (
    <Link to={`/owner/${ownerUserId}/reviews`} className="group flex min-h-11 items-center gap-2 text-[15px]">
      <Star className="h-4 w-4 shrink-0 fill-[#E8B53E] text-[#E8B53E]" aria-hidden="true" />
      {reviewCount > 0 ? (
        <span>
          <span className="font-bold">{averageRating.toFixed(1)}</span> · {reviewCount} {reviewCount === 1 ? "review" : "reviews"} from Nomads
        </span>
      ) : (
        <span className="text-muted-foreground">No reviews from Nomads yet</span>
      )}
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
};

export default OwnerReviewsSummaryCard;
