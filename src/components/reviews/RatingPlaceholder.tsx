import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingPlaceholderProps {
  label?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Shown where a rating would normally appear when there are no reviews yet,
 * so the UI never looks empty or broken. Replaces absent/empty sub-ratings
 * with a clear "No reviews yet" message.
 */
const RatingPlaceholder = ({
  label = "No reviews yet",
  compact = true,
  className,
}: RatingPlaceholderProps) => (
  <div
    className={cn(
      "flex items-center gap-1 text-muted-foreground/70",
      compact ? "text-[10px]" : "text-sm",
      className
    )}
    aria-label={label}
    role="status"
  >
    <Star className={compact ? "w-2.5 h-2.5" : "w-4 h-4"} />
    <span className="italic">{label}</span>
  </div>
);

export default RatingPlaceholder;
