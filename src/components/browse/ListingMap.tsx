import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { ListingWithDetails } from "@/hooks/useListings";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";

// Fix default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface ListingMapProps {
  listings: ListingWithDetails[];
}

const FitBounds = ({ listings }: { listings: ListingWithDetails[] }) => {
  const map = useMap();

  useEffect(() => {
    const coords = listings
      .filter((l) => l.latitude && l.longitude)
      .map((l) => [l.latitude!, l.longitude!] as [number, number]);

    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [listings, map]);

  return null;
};

const ListingMap = ({ listings }: ListingMapProps) => {
  const listingsWithCoords = listings.filter((l) => l.latitude && l.longitude);

  return (
    <div className="w-full h-[600px] rounded-lg overflow-hidden border border-border">
      <MapContainer
        center={[30, 0]}
        zoom={2}
        className="w-full h-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds listings={listingsWithCoords} />
        {listingsWithCoords.map((listing) => {
          const openSitDate = listing.sit_dates.find((d) => d.status === "open");
          const dateRange = openSitDate
            ? `${format(new Date(openSitDate.start_date), "MMM d")} – ${format(new Date(openSitDate.end_date), "MMM d, yyyy")}`
            : "Dates TBD";
          const location = [listing.city, listing.country].filter(Boolean).join(", ");

          return (
            <Marker key={listing.id} position={[listing.latitude!, listing.longitude!]}>
              <Popup>
                <div className="min-w-[200px]">
                  {listing.photos?.[0] && (
                    <img
                      src={listing.photos[0]}
                      alt={listing.title}
                      className="w-full h-28 object-cover rounded-md mb-2"
                    />
                  )}
                  <Link
                    to={`/listing/${listing.id}`}
                    className="font-semibold text-sm hover:text-primary transition-colors block mb-1"
                  >
                    {listing.title}
                  </Link>
                  {location && <p className="text-xs text-muted-foreground">{location}</p>}
                  <p className="text-xs text-muted-foreground">{dateRange}</p>
                  <p className="text-xs mt-1">
                    {listing.pets.map((p) => p.name || p.type).join(", ")}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      {listingsWithCoords.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 pointer-events-none">
          <p className="text-muted-foreground text-sm">No listings have location data yet.</p>
        </div>
      )}
    </div>
  );
};

export default ListingMap;
