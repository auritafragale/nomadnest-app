import { Link } from "react-router-dom";
import { differenceInDays, parseISO } from "date-fns";
import { ListingWithDetails } from "@/hooks/useListings";
import { shortRange } from "@/components/nn/ui";
import { PetChips, RatingChip, SaveHeart } from "@/components/browse/SitCardParts";
import { openDates, sitPlace } from "@/lib/sitCard";

interface ListingCardProps {
  listing: ListingWithDetails;
  /** Signed out: the heart asks them to create an account instead. */
  onSignUpPrompt?: () => void;
}

/** One sit (design: SitsListPhone). */
const ListingCard = ({ listing, onSignUpPrompt }: ListingCardProps) => {
  const { first: openDate } = openDates(listing);
  const shortNotice = !!openDate && differenceInDays(parseISO(openDate.start_date), new Date()) <= 14;

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-[22px] border border-border bg-card">
      <div className="relative aspect-[16/9] overflow-hidden bg-[#CDB79E] md:aspect-[4/3]">
        {listing.photos?.[0] && (
          <img src={listing.photos[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        )}
        {shortNotice && (
          <span className="absolute left-3 top-3 inline-flex h-7 items-center rounded-full bg-brand-coral-light px-3 text-xs font-bold text-brand-coral-text">
            Short notice
          </span>
        )}
        <SaveHeart listing={listing} onSignUpPrompt={onSignUpPrompt} className="absolute right-3 top-3" />
      </div>
      <Link to={`/listing/${listing.id}`} className="flex flex-1 flex-col gap-1.5 px-3.5 py-3 after:absolute after:inset-0 after:content-[''] md:p-4">
        <h3 className="line-clamp-2 font-body text-[16px] font-bold leading-snug md:text-[17px]">{listing.title}</h3>
        {/* The place gives way; the dates are never cut. */}
        <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
          <span className="truncate">{sitPlace(listing)}</span>
          <span className="shrink-0">· {openDate ? shortRange(openDate.start_date, openDate.end_date) : "Dates to be confirmed"}</span>
        </span>
        <span className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <PetChips pets={listing.pets} withName />
          <RatingChip rating={listing.owner_rating} />
        </span>
      </Link>
    </article>
  );
};

export default ListingCard;
