import { Heart, Loader2, Star } from "lucide-react";
import type { ListingWithDetails } from "@/hooks/useListings";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useAuth } from "@/contexts/AuthContext";
import { formatPetType, petTypeIcon } from "@/lib/petTypes";
import { petCounts } from "@/lib/sitCard";
import { cn } from "@/lib/utils";

/** "Cats" → "Cat" for one; Fish stays Fish. */
const petName = (type: string, n: number) => {
  const label = formatPetType(type);
  return n === 1 && /s$/.test(label) && label !== "Fish" ? label.slice(0, -1) : label;
};

/**
 * Small teal chips, one per pet type: the type's icon and the count, plus
 * the type name on grid cards. Screen readers hear it in full ("2 cats").
 */
export const PetChips = ({ pets, withName = false, className }: { pets: ListingWithDetails["pets"]; withName?: boolean; className?: string }) => {
  const list = petCounts(pets);
  if (list.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-1.5", className)}>
      {list.map(({ type, count }) => {
        const Icon = petTypeIcon(type);
        const full = `${count} ${petName(type, count).toLowerCase()}`;
        return (
          <span
            key={type}
            role="img"
            aria-label={full}
            title={full}
            className="inline-flex h-[26px] items-center gap-1 rounded-full bg-[var(--nn-teal-soft)] px-2 text-[13px] font-bold text-[var(--nn-teal-soft-text)]"
          >
            <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
            <span aria-hidden="true">{withName ? `${count} ${petName(type, count)}` : count}</span>
          </span>
        );
      })}
    </span>
  );
};

/**
 * The host's rating: "★ 4.9 (12)", or "New host" with no reviews yet.
 * `onPhoto`: the white chip on a map card's photo; otherwise a muted chip.
 */
export const RatingChip = ({ rating, onPhoto = false }: { rating: ListingWithDetails["owner_rating"]; onPhoto?: boolean }) => {
  const has = !!rating && rating.count > 0;
  return (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-[9px] text-xs font-bold",
        onPhoto ? "bg-[var(--nn-photo-chip)] text-[var(--nn-photo-chip-ink)]" : "bg-muted text-foreground",
      )}
      aria-label={has ? `Host rated ${rating!.average.toFixed(1)} from ${rating!.count} ${rating!.count === 1 ? "review" : "reviews"}` : "New host"}
    >
      {has ? (
        <>
          <Star className="h-[13px] w-[13px] fill-[#E8B53E] text-[#E8B53E]" aria-hidden="true" />
          <span aria-hidden="true">
            {rating!.average.toFixed(1)} <span className="font-medium opacity-75">({rating!.count})</span>
          </span>
        </>
      ) : (
        "New host"
      )}
    </span>
  );
};

/** The Save heart: the same save logic and signed-out prompt everywhere. 44px tap target. */
export const SaveHeart = ({
  listing,
  onSignUpPrompt,
  size = "md",
  className,
}: {
  listing: Pick<ListingWithDetails, "id" | "title">;
  onSignUpPrompt?: () => void;
  size?: "sm" | "md";
  className?: string;
}) => {
  const { user } = useAuth();
  const { data: favoriteIds = [] } = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const isFavorited = favoriteIds.includes(listing.id);

  const onHeart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      onSignUpPrompt?.();
      return;
    }
    toggleFavorite.mutate({ listingId: listing.id, isFavorited });
  };

  const icon = size === "sm" ? "h-[18px] w-[18px]" : "h-5 w-5";
  return (
    <button
      type="button"
      onClick={onHeart}
      disabled={toggleFavorite.isPending}
      aria-label={isFavorited ? `Remove ${listing.title} from saved` : `Save ${listing.title}`}
      aria-pressed={isFavorited}
      className={cn("z-10 flex h-11 w-11 items-center justify-center", className)}
    >
      <span className={cn("flex items-center justify-center rounded-full bg-card text-foreground shadow-md", size === "sm" ? "h-8 w-8" : "h-11 w-11")}>
        {toggleFavorite.isPending ? (
          <Loader2 className={cn(icon, "animate-spin")} aria-hidden="true" />
        ) : (
          <Heart className={cn(icon, isFavorited && "fill-brand-coral text-brand-coral-text")} aria-hidden="true" />
        )}
      </span>
    </button>
  );
};
