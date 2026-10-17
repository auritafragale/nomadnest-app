import { Link } from "react-router-dom";
import { Calendar, MapPin } from "lucide-react";
import type { ListingWithDetails } from "@/hooks/useListings";
import { shortRange, nnButton } from "@/components/nn/ui";
import { PetChips, RatingChip, SaveHeart } from "@/components/browse/SitCardParts";
import { openDates, sitPlace } from "@/lib/sitCard";
import { cn } from "@/lib/utils";

/**
 * A sit on the map (design: SitsMapPhone, SitsMapDesktop): photo with the
 * Save heart and the host rating, title, place, first open dates, pet chips
 * and View sit. Used in the carousel and the desktop panel.
 */
const SitMapCard = ({
  listing,
  selected,
  onPick,
  onSignUpPrompt,
}: {
  listing: ListingWithDetails;
  selected: boolean;
  onPick: () => void;
  onSignUpPrompt: () => void;
}) => {
  const { first, more } = openDates(listing);
  return (
    <article
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a,button")) onPick();
      }}
      className={cn(
        "flex h-full w-full overflow-hidden rounded-[20px] bg-card shadow-float",
        selected ? "border-2 border-brand-coral" : "border border-border",
      )}
    >
      <div className="relative w-[104px] shrink-0 bg-[#CDB79E]">
        {listing.photos?.[0] && <img src={listing.photos[0]} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
        <SaveHeart listing={listing} onSignUpPrompt={onSignUpPrompt} size="sm" className="absolute left-0.5 top-0.5" />
        <span className="absolute bottom-2 left-2">
          <RatingChip rating={listing.owner_rating} onPhoto />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[5px] p-3">
        <h3 className="line-clamp-2 font-body text-[15px] font-bold leading-[1.3]">{listing.title}</h3>
        <span className="flex min-w-0 items-center gap-[5px] text-[13px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{sitPlace(listing)}</span>
        </span>
        <span className="flex items-center gap-[5px] text-[13px] text-foreground/80">
          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{first ? shortRange(first.start_date, first.end_date) : "Dates to be confirmed"}</span>
          {more > 0 && (
            <span className="ml-1 shrink-0 rounded-full bg-muted px-[7px] py-px text-xs font-bold" aria-label={`and ${more} more ${more === 1 ? "date" : "dates"}`}>
              +{more}
            </span>
          )}
        </span>
        <PetChips pets={listing.pets} />
        <Link to={`/listing/${listing.id}`} className={nnButton("primary", "mt-1 h-11 rounded-xl text-sm")}>
          View sit
        </Link>
      </div>
    </article>
  );
};

export default SitMapCard;
