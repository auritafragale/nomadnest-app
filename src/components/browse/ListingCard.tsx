import { Link } from "react-router-dom";
import { differenceInDays, parseISO } from "date-fns";
import { BadgeCheck, Calendar, Heart, Loader2, MapPin, PawPrint, Star } from "lucide-react";
import { ListingWithDetails } from "@/hooks/useListings";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useAuth } from "@/contexts/AuthContext";
import { shortRange } from "@/components/nn/ui";
import { cn } from "@/lib/utils";

interface ListingCardProps {
  listing: ListingWithDetails;
  /** Signed out: the heart asks them to create an account instead. */
  onSignUpPrompt?: () => void;
}

const petLine = (pets: ListingWithDetails["pets"]) => {
  const counts = new Map<string, number>();
  for (const p of pets) {
    const t = p.type.toLowerCase();
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].map(([t, n]) => `${n} ${n === 1 ? t : t.endsWith("s") ? t : `${t}s`}`).join(", ");
};

/** One sit (design: BrowsePhone cards). */
const ListingCard = ({ listing, onSignUpPrompt }: ListingCardProps) => {
  const { user } = useAuth();
  const { data: favoriteIds = [] } = useFavorites();
  const toggleFavorite = useToggleFavorite();

  const isFavorited = favoriteIds.includes(listing.id);
  const today = new Date().toISOString().slice(0, 10);
  const openDate = [...listing.sit_dates]
    .filter((d) => d.status === "open" && d.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const shortNotice = !!openDate && differenceInDays(parseISO(openDate.start_date), new Date()) <= 14;
  const place = [listing.city, listing.country].filter(Boolean).join(", ") || "Location to be confirmed";
  const host = listing.owner_profile?.first_name || null;
  const pets = petLine(listing.pets);

  const onHeart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      onSignUpPrompt?.();
      return;
    }
    toggleFavorite.mutate({ listingId: listing.id, isFavorited });
  };

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-[22px] border border-border bg-card">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#CDB79E]">
        {listing.photos?.[0] && (
          <img src={listing.photos[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        )}
        {shortNotice && (
          <span className="absolute left-3 top-3 inline-flex h-7 items-center rounded-full bg-brand-coral-light px-3 text-xs font-bold text-brand-coral-text">
            Short notice
          </span>
        )}
        <button
          type="button"
          onClick={onHeart}
          disabled={toggleFavorite.isPending}
          aria-label={isFavorited ? `Remove ${listing.title} from saved` : `Save ${listing.title}`}
          aria-pressed={isFavorited}
          className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-md"
        >
          {toggleFavorite.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Heart className={cn("h-5 w-5", isFavorited && "fill-brand-coral text-brand-coral-text")} aria-hidden="true" />
          )}
        </button>
      </div>
      <Link to={`/listing/${listing.id}`} className="flex flex-1 flex-col gap-1.5 p-4 after:absolute after:inset-0 after:content-['']">
        <h3 className="line-clamp-2 text-[17px] font-bold leading-snug">{listing.title}</h3>
        <span className="flex items-center gap-1.5 text-[15px] text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{place}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[15px] text-muted-foreground">
          <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
          {openDate ? shortRange(openDate.start_date, openDate.end_date) : "Dates to be confirmed"}
        </span>
        {pets && (
          <span className="flex items-center gap-1.5 text-[15px] text-muted-foreground">
            <PawPrint className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pets}
          </span>
        )}
        <span className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-sm">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-xs font-bold text-[#5A4636]">
            {listing.owner_profile?.avatar_url ? (
              <img src={listing.owner_profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (host ?? "?").slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="min-w-0 truncate">{host ? `Hosted by ${host}` : "Hosted by a Pet Parent"}</span>
          {listing.owner_profile?.id_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-teal-text" aria-label="ID verified" />}
          <span className="ml-auto flex shrink-0 items-center gap-1 font-semibold">
            {listing.owner_rating && listing.owner_rating.count > 0 ? (
              <>
                <Star className="h-3.5 w-3.5 fill-[#E8B53E] text-[#E8B53E]" aria-hidden="true" />
                {listing.owner_rating.average.toFixed(1)} ({listing.owner_rating.count})
              </>
            ) : (
              <span className="text-muted-foreground">New host</span>
            )}
          </span>
        </span>
      </Link>
    </article>
  );
};

export default ListingCard;
