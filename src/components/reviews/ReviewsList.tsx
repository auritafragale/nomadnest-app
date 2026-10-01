import { useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ReviewItem {
  id: string;
  rating: number;
  text: string | null;
  /** First name only, "Former member", or the fallback. */
  name: string;
  avatarUrl: string | null;
  meta: string;
  /** The sit's listing, linked from the review when known. */
  listing?: { id: string; title: string } | null;
  categories: { label: string; value: number | null }[];
}

const Stars = ({ rating, size = "h-4 w-4" }: { rating: number; size?: string }) => (
  <span className="flex gap-0.5" role="img" aria-label={`${rating} out of 5`}>
    {[1, 2, 3, 4, 5].map((s) => (
      <Star key={s} className={cn(size, s <= rating ? "fill-[#E8B53E] text-[#E8B53E]" : "text-muted-foreground")} aria-hidden="true" />
    ))}
  </span>
);

const ReviewRow = ({ review }: { review: ReviewItem }) => {
  const [open, setOpen] = useState(false);
  const cats = review.categories.filter((c): c is { label: string; value: number } => c.value != null);
  return (
    <li className="flex flex-col gap-3 border-t border-[var(--nn-line)] py-5 first:border-t-0">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-base font-bold text-[#5A4636]">
          {review.avatarUrl ? <img src={review.avatarUrl} alt="" className="h-full w-full object-cover" /> : review.name.slice(0, 1)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-bold">{review.name}</span>
          <span className="text-sm text-muted-foreground">
            {review.meta}
            {review.listing?.id && (
              <>
                {" · "}
                <Link to={`/listing/${review.listing.id}`} className="font-semibold text-foreground underline underline-offset-2">
                  {review.listing.title}
                </Link>
              </>
            )}
          </span>
        </div>
        <Stars rating={review.rating} />
      </div>
      {review.text ? (
        <p className="whitespace-pre-line text-[16px] leading-relaxed">{review.text}</p>
      ) : (
        <p className="text-[15px] italic text-muted-foreground">No written review for this sit.</p>
      )}
      {cats.length > 0 && (
        <>
          {open && (
            <dl id={`cats-${review.id}`} className="flex flex-col gap-2 rounded-2xl bg-muted p-4">
              {cats.map((c) => (
                <div key={c.label} className="flex items-center justify-between gap-3">
                  <dt className="text-[15px]">{c.label}</dt>
                  <dd>
                    <Stars rating={c.value} size="h-3.5 w-3.5" />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`cats-${review.id}`}
            onClick={() => setOpen(!open)}
            className="min-h-11 self-start text-[15px] font-bold underline underline-offset-2"
          >
            {open ? "Hide the details" : "See the details"}
          </button>
        </>
      )}
    </li>
  );
};

/** A plain list of reviews (design: ReviewsPhone, ReviewsTablet, ReviewsDesktop). */
const ReviewsList = ({ reviews, loading }: { reviews: ReviewItem[]; loading: boolean }) => {
  if (loading) return <Skeleton className="h-64 w-full rounded-[22px]" />;
  if (reviews.length === 0) {
    return <p className="rounded-[22px] border border-dashed border-border p-8 text-center text-[15px] text-muted-foreground">No reviews yet.</p>;
  }
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-[16px] font-bold">
        <Stars rating={Math.round(avg)} />
        {avg.toFixed(1)} · {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
      </p>
      <ul className="flex flex-col">
        {reviews.map((r) => (
          <ReviewRow key={r.id} review={r} />
        ))}
      </ul>
    </div>
  );
};

export default ReviewsList;
