import { Star } from "lucide-react";
import { NavRow, SectionCard } from "@/components/nn/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberRating, useMyWaitingReviews, type ReviewSide } from "@/lib/reviews";

/** "Reviews about you" from the dashboard: the member's own reviews page. */
export const ReviewsAboutYouNavRow = ({ side, first }: { side: ReviewSide; first?: boolean }) => {
  const { user } = useAuth();
  const { data: rating } = useMemberRating(user?.id, side);
  const { data: waiting = [] } = useMyWaitingReviews(!!user);
  const waitingHere = waiting.filter((w) => w.side === side).length;
  const subtitle =
    waitingHere > 0
      ? `${waitingHere === 1 ? "A review is" : `${waitingHere} reviews are`} waiting for yours`
      : rating && rating.count > 0 && rating.average != null
        ? `★ ${rating.average.toFixed(1)} · ${rating.count} ${rating.count === 1 ? "review" : "reviews"}`
        : "After your first sit";
  if (!user) return null;
  return (
    <NavRow
      first={first}
      to={`/${side === "sitter" ? "sitter" : "owner"}/${user.id}/reviews`}
      icon={Star}
      title="Reviews about you"
      subtitle={subtitle}
      subtitleTone={waitingHere > 0 ? "accent" : "grey"}
      iconTone="neutral"
    />
  );
};

/** The same row in its own card (phone and tablet dashboards). */
const ReviewsAboutYouRow = ({ side, className }: { side: ReviewSide; className?: string }) => (
  <SectionCard label="Reviews about you" className={`px-[18px] py-1.5 ${className ?? ""}`}>
    <ReviewsAboutYouNavRow side={side} first />
  </SectionCard>
);

export default ReviewsAboutYouRow;
