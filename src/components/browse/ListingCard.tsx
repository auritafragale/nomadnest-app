import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Calendar, Cat, Dog, Heart, Loader2, Star } from "lucide-react";
import { ListingWithDetails } from "@/hooks/useListings";
import { format, differenceInDays } from "date-fns";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface ListingCardProps {
  listing: ListingWithDetails;
  viewMode: "grid" | "list";
}

const petIcon = (type: string) =>
  type.toLowerCase() === "cat" ? <Cat className="w-3 h-3" /> : <Dog className="w-3 h-3" />;

const ListingCard = ({ listing, viewMode }: ListingCardProps) => {
  const { user } = useAuth();
  const { data: favoriteIds = [] } = useFavorites();
  const toggleFavorite = useToggleFavorite();

  const isFavorited = favoriteIds.includes(listing.id);
  const openSitDate = listing.sit_dates.find((d) => d.status === "open");
  const dateRange = openSitDate
    ? `${format(new Date(openSitDate.start_date), "MMM d")} - ${format(new Date(openSitDate.end_date), "MMM d, yyyy")}`
    : "Dates TBD";

  const isShortNotice =
    openSitDate &&
    differenceInDays(new Date(openSitDate.start_date), new Date()) <= 14;

  const location = [listing.city, listing.country].filter(Boolean).join(", ") || "Location TBD";
  const imageUrl =
    listing.photos?.[0] ||
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop";

  const ownerInitials =
    listing.owner_profile
      ? `${listing.owner_profile.first_name?.[0] || ""}${listing.owner_profile.last_name?.[0] || ""}`.toUpperCase() || "?"
      : "?";

  const ownerName = listing.owner_profile
    ? `${listing.owner_profile.first_name || ""} ${listing.owner_profile.last_name || ""}`.trim()
    : "";

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    toggleFavorite.mutate({ listingId: listing.id, isFavorited });
  };

  if (viewMode === "list") {
    return (
      <Link to={`/listing/${listing.id}`}>
        <Card variant="interactive" className="overflow-hidden group flex flex-row">
          <div className="relative overflow-hidden w-28 sm:w-48 md:w-64 flex-shrink-0">
            <img
              src={imageUrl}
              alt={listing.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {user && (
              <button
                className={cn(
                  "absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                  isFavorited
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface/90 hover:bg-surface text-muted-foreground hover:text-primary"
                )}
                onClick={handleFavoriteClick}
                disabled={toggleFavorite.isPending}
                aria-label={isFavorited ? "Remove from favourites" : "Add to favourites"}
              >
                {toggleFavorite.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Heart className={cn("w-5 h-5", isFavorited && "fill-current")} />
                )}
              </button>
            )}
            {openSitDate && (
              <div className="absolute bottom-3 left-3">
                <Badge variant="published">Open</Badge>
              </div>
            )}
          </div>
          <div className="p-5 flex-1">
            <h3 className="font-semibold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
              {listing.title}
            </h3>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                {location}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                {dateRange}
              </div>
            </div>
            {listing.owner_rating && listing.owner_rating.count > 0 && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="font-medium">{listing.owner_rating.average.toFixed(1)}</span>
                <span>({listing.owner_rating.count})</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {listing.pets.map((pet) => (
                <Badge key={pet.id} variant="muted" className="gap-1">
                  {petIcon(pet.type)}
                  {pet.name || pet.type}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      </Link>
    );
  }

  // Grid mode — new mobile-first card design
  return (
    <Link to={`/listing/${listing.id}`} className="h-full">
      <Card variant="interactive" className="overflow-hidden group h-full flex flex-col">
        {/* Image */}
        <div className="relative aspect-square sm:aspect-[4/3] overflow-hidden">
          <img
            src={imageUrl}
            alt={listing.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />

          {/* Heart */}
          {user && (
            <button
              className={cn(
                "absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-colors shadow-sm",
                isFavorited
                  ? "bg-[#E8735A] text-white"
                  : "bg-white/90 text-muted-foreground hover:text-[#E8735A]"
              )}
              onClick={handleFavoriteClick}
              disabled={toggleFavorite.isPending}
            >
              {toggleFavorite.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Heart className={cn("w-4 h-4", isFavorited && "fill-current")} />
              )}
            </button>
          )}

          {/* Short Notice badge */}
          {isShortNotice && (
            <div className="absolute top-3 left-3">
              <span className="px-2 py-1 rounded-full text-white text-xs font-semibold" style={{ backgroundColor: "#E8735A" }}>
                Short Notice
              </span>
            </div>
          )}
        </div>

        <div className="p-2.5 sm:p-4 flex-1 flex flex-col">
          {/* Host row */}
          {ownerName && (
            <div className="hidden sm:flex items-center gap-2 mb-2">
              <Avatar className="w-6 h-6">
                <AvatarImage src={listing.owner_profile?.avatar_url || undefined} />
                <AvatarFallback className="text-[10px]">{ownerInitials}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">Hosted by {ownerName}</span>
            </div>
          )}

          {/* Title */}
          <h3 className="font-semibold text-sm sm:text-base leading-snug mb-1.5 sm:mb-2 line-clamp-2 group-hover:text-primary transition-colors">
            {listing.title}
          </h3>

          {/* Location & Dates */}
          <div className="space-y-1 mb-3">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
              <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
              <span className="truncate">{location}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
              {dateRange}
            </div>
          </div>

          {/* Rating + Pets row */}
          <div className="flex items-center justify-between flex-wrap gap-2 mt-auto pt-2">
            {listing.owner_rating && listing.owner_rating.count > 0 ? (
              <div className="flex items-center gap-1 text-sm">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                <span className="font-medium">{listing.owner_rating.average.toFixed(1)}</span>
                <span className="text-muted-foreground">({listing.owner_rating.count})</span>
              </div>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-1">
              {(() => {
                const counts: Record<string, number> = {};
                listing.pets.forEach((pet) => {
                  const key = pet.type.toLowerCase();
                  counts[key] = (counts[key] || 0) + 1;
                });
                return Object.entries(counts).map(([type, count]) => (
                  <Badge key={type} variant="muted" className="gap-1 text-xs px-1.5">
                    {petIcon(type)}
                    {count > 1 && <span className="font-medium">{count}</span>}
                  </Badge>
                ));
              })()}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
};

export default ListingCard;
