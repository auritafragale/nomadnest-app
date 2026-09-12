import { Link } from "react-router-dom";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { canonicalPetType, petTypeIcon, formatPetType } from "@/lib/petTypes";
import type { ListingWithDetails } from "@/hooks/useListings";

// formatPetType() always returns the plural canonical label ("Cats", "Dogs",
// "Farm animals"...) since that's what the rest of the app needs it for.
// Here a single pet reads better singular ("Cat" instead of "1 Cats") — Fish
// is the one canonical label that's already the same both ways.
const singularize = (label: string) =>
  label.toLowerCase() === "fish" || !label.endsWith("s") ? label : label.slice(0, -1);

/**
 * Compact map-bottom-sheet variant of the listing card. Distinct from
 * src/components/browse/ListingCard.tsx (the Browse Sits grid card): no
 * location (members already searched for this city to see the pin at all),
 * and pet types collapse to one icon + count + label per type instead of
 * repeated icons.
 */
const ListingMapCard = ({ listing }: { listing: ListingWithDetails }) => {
  const openDates = listing.sit_dates.filter((d) => d.status === "open");
  const [primaryDate, ...extraDates] = openDates;

  const petCounts = new Map<string, number>();
  listing.pets.forEach((pet) => {
    const key = canonicalPetType(pet.type);
    petCounts.set(key, (petCounts.get(key) || 0) + 1);
  });

  return (
    <div className="min-w-[200px] max-w-[260px]">
      {listing.photos?.[0] && (
        <img
          src={listing.photos[0]}
          alt={listing.title}
          className="w-full h-28 object-cover object-center rounded-md mb-2"
        />
      )}

      <p className="font-semibold text-sm mb-1">{listing.title}</p>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Calendar className="w-3 h-3 flex-shrink-0" />
        <span>
          {primaryDate
            ? `${format(new Date(primaryDate.start_date), "MMM d")} – ${format(new Date(primaryDate.end_date), "MMM d, yyyy")}`
            : "Dates TBD"}
        </span>
        {extraDates.length > 0 && (
          <Badge variant="muted" className="text-[10px] px-1.5 py-0 h-4 leading-none">
            +{extraDates.length}
          </Badge>
        )}
      </p>

      {petCounts.size > 0 && (
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-1.5">
          {Array.from(petCounts.entries()).map(([type, count]) => {
            const Icon = petTypeIcon(type);
            const label = formatPetType(type);
            return (
              <span
                key={type}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {count > 1 ? `${count} ${label}` : singularize(label)}
              </span>
            );
          })}
        </div>
      )}

      <Link to={`/listing/${listing.id}`}>
        <Button size="sm" className="w-full mt-2 h-8 text-xs">
          View Listing
        </Button>
      </Link>
    </div>
  );
};

export default ListingMapCard;
