import { Link } from "react-router-dom";
import { ChevronRight, Star } from "lucide-react";
import { useSitterAverageRating } from "@/hooks/useSitterReviews";

interface SitterReviewsSummaryCardProps {
  sitterUserId: string;
}

/** Reviews summary with a link to every review. */
const SitterReviewsSummaryCard = ({ sitterUserId }: SitterReviewsSummaryCardProps) => {
  const { data: ratingData } = useSitterAverageRating(sitterUserId);
  const average = ratingData?.average ?? 0;
  const count = ratingData?.count ?? 0;

  return (
    <Link to={`/sitter/${sitterUserId}/reviews`} className="group flex min-h-[56px] items-center gap-3 rounded-[20px] border border-[var(--nn-border)] bg-card px-4 py-3">
      <Star className="h-5 w-5 shrink-0 fill-[#E8B53E] text-[#E8B53E]" aria-hidden="true" />
      {count > 0 ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] font-bold">
            {average.toFixed(1)} · {count} {count === 1 ? "review" : "reviews"}
          </span>
          <span className="text-sm text-muted-foreground">Read all {count === 1 ? "1 review" : `${count} reviews`}</span>
        </span>
      ) : (
        <span className="flex-1 text-[15px] text-muted-foreground">No reviews yet</span>
      )}
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
};

export default SitterReviewsSummaryCard;
