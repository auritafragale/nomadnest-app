import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

interface FoundingMemberBadgeProps {
  className?: string;
}

const FoundingMemberBadge = ({ className }: FoundingMemberBadgeProps) => {
  return (
    <Badge
      variant="outline"
      className={`gap-1 border-accent bg-accent/10 text-accent-foreground dark:bg-accent/20 dark:text-accent dark:border-accent ${className || ""}`}
    >
      <Star className="w-3 h-3 fill-accent text-accent" />
      Founding Member
    </Badge>
  );
};

export default FoundingMemberBadge;