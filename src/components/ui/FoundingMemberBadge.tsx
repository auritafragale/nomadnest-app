import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface FoundingMemberBadgeProps {
  className?: string;
  /** Compact variant for dense card grids. */
  compact?: boolean;
}

const FoundingMemberBadge = ({ className, compact }: FoundingMemberBadgeProps) => {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 whitespace-nowrap border-accent bg-accent/10 text-accent-foreground dark:bg-accent/20 dark:text-accent dark:border-accent",
        compact && "gap-0.5 h-5 px-1.5 text-[10px] leading-none",
        className,
      )}
    >
      <Star className={cn("fill-accent text-accent", compact ? "w-2.5 h-2.5" : "w-3 h-3")} />
      Founding Member
    </Badge>
  );
};

export default FoundingMemberBadge;
