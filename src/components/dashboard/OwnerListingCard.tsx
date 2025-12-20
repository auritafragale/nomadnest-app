import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Calendar, Edit, Eye, Users } from "lucide-react";
import { format } from "date-fns";
import { OwnerListing } from "@/hooks/useOwnerListings";

interface OwnerListingCardProps {
  listing: OwnerListing;
}

const statusColors = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-primary/10 text-primary",
  paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
};

export const OwnerListingCard = ({ listing }: OwnerListingCardProps) => {
  const nextDate = listing.sit_dates.find((d) => d.status === "open");
  const petNames = listing.pets.map((p) => p.name || p.type).join(", ");

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail */}
          <div className="w-24 h-24 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
            {listing.photos && listing.photos.length > 0 ? (
              <img
                src={listing.photos[0]}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No image
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="font-semibold text-foreground truncate">
                  {listing.title}
                </h3>
                {listing.city && listing.country && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {listing.city}, {listing.country}
                  </p>
                )}
              </div>
              <Badge className={statusColors[listing.status]}>
                {listing.status}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
              {petNames && (
                <span className="flex items-center gap-1">
                  🐾 {petNames}
                </span>
              )}
              {nextDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(nextDate.start_date), "MMM d")} -{" "}
                  {format(new Date(nextDate.end_date), "MMM d, yyyy")}
                </span>
              )}
              {listing._count.applications > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {listing._count.applications} application
                  {listing._count.applications !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <Link to={`/edit-listing/${listing.id}`}>
                <Button size="sm" variant="outline">
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              </Link>
              {listing.status === "published" && (
                <Link to={`/listing/${listing.id}`}>
                  <Button size="sm" variant="ghost">
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
