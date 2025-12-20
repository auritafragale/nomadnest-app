import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Cat, Dog, Wifi, Heart } from "lucide-react";
import { ListingWithDetails } from "@/hooks/useListings";
import { format } from "date-fns";

interface ListingCardProps {
  listing: ListingWithDetails;
  viewMode: "grid" | "list";
}

const ListingCard = ({ listing, viewMode }: ListingCardProps) => {
  const openSitDate = listing.sit_dates.find((d) => d.status === "open");
  const dateRange = openSitDate
    ? `${format(new Date(openSitDate.start_date), "MMM d")} - ${format(new Date(openSitDate.end_date), "MMM d, yyyy")}`
    : "Dates TBD";

  const location = [listing.city, listing.country].filter(Boolean).join(", ") || "Location TBD";
  const imageUrl = listing.photos?.[0] || "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop";

  return (
    <Card
      variant="interactive"
      className={`overflow-hidden group ${viewMode === "list" ? "flex flex-row" : ""}`}
    >
      <div
        className={`relative overflow-hidden ${
          viewMode === "list" ? "w-64 flex-shrink-0" : "aspect-[4/3]"
        }`}
      >
        <img
          src={imageUrl}
          alt={listing.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <button className="absolute top-3 right-3 w-9 h-9 rounded-full bg-surface/90 flex items-center justify-center hover:bg-surface transition-colors">
          <Heart className="w-5 h-5 text-muted-foreground hover:text-primary" />
        </button>
        <div className="absolute bottom-3 left-3">
          <Badge variant="published">Open</Badge>
        </div>
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
        <div className="flex flex-wrap gap-2">
          {listing.pets.map((pet) => (
            <Badge key={pet.id} variant="muted" className="gap-1">
              {pet.type.toLowerCase() === "cat" ? (
                <Cat className="w-3 h-3" />
              ) : (
                <Dog className="w-3 h-3" />
              )}
              {pet.name || pet.type}
            </Badge>
          ))}
          {listing.amenities?.includes("wifi") && (
            <Badge variant="muted" className="gap-1">
              <Wifi className="w-3 h-3" />
              Wi-Fi
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
};

export default ListingCard;
