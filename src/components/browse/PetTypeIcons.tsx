import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPetType, petTypeIcon, dedupePetTypes } from "@/lib/petTypes";

interface PetTypeIconsProps {
  petTypes: string[] | null | undefined;
  /** Maximum number of icons shown before the "+" overflow marker. */
  max?: number;
  className?: string;
}

/**
 * Compact, icon-only pet experience row for cards.
 * Shows up to `max` animal icons and a "+" when there are more.
 */
const PetTypeIcons = ({ petTypes, max = 4, className }: PetTypeIconsProps) => {
  const all = dedupePetTypes(petTypes || []);
  if (all.length === 0) return null;

  const shown = all.slice(0, max);
  const hasMore = all.length > max;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((type) => {
        const Icon = petTypeIcon(type);
        return (
          <Badge
            key={type}
            variant="muted"
            className="h-6 w-6 p-0 flex items-center justify-center"
            title={formatPetType(type)}
            aria-label={formatPetType(type)}
          >
            <Icon className="w-3.5 h-3.5" />
          </Badge>
        );
      })}
      {hasMore && (
        <Badge
          variant="muted"
          className="h-6 min-w-6 px-1 flex items-center justify-center text-xs font-semibold"
          title={`Also experienced with ${all
            .slice(max)
            .map(formatPetType)
            .join(", ")}`}
          aria-label={`Experienced with ${all.length - max} more animal types`}
        >
          +
        </Badge>
      )}
    </div>
  );
};

export default PetTypeIcons;
