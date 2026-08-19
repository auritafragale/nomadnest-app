import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategoryAverage } from "@/lib/categoryRatings";

interface CategoryRatingsSummaryProps {
  categories: CategoryAverage[];
  /** Limit how many categories are shown (cards use a compact subset). */
  limit?: number;
  className?: string;
  compact?: boolean;
}

/**
 * Compact display of reviewer category sub-ratings, used on sitter/owner cards.
 */
const CategoryRatingsSummary = ({
  categories,
  limit,
  className,
  compact = true,
}: CategoryRatingsSummaryProps) => {
  if (!categories || categories.length === 0) return null;
  const shown = typeof limit === "number" ? categories.slice(0, limit) : categories;

  return (
    <ul
      className={cn(
        "w-full grid gap-x-2 gap-y-0.5",
        compact ? "grid-cols-2 text-[10px]" : "grid-cols-2 text-xs",
        className
      )}
    >
      {shown.map((c) => (
        <li
          key={c.key}
          className="flex items-center justify-between gap-1 text-muted-foreground"
        >
          <span className="truncate">{c.label}</span>
          <span className="flex items-center gap-0.5 font-medium text-foreground">
            <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
            {c.average.toFixed(1)}
          </span>
        </li>
      ))}
    </ul>
  );
};

export default CategoryRatingsSummary;
