import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

interface FoundingMemberBadgeProps {
  className?: string;
}

const FoundingMemberBadge = ({ className }: FoundingMemberBadgeProps) => {
  return (
    <Badge
      variant="outline"
      className={`gap-1 border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-600 ${className || ""}`}
    >
      <Star className="w-3 h-3 fill-current" />
      Founding Member
    </Badge>
  );
};

export default FoundingMemberBadge;
