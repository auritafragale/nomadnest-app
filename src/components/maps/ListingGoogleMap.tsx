import { useState, useEffect, useRef, useCallback } from "react";
import { Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Marker } from "@googlemaps/markerclusterer";
import { ListingWithDetails } from "@/hooks/useListings";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";

const CoralPin = () => (
  <div className="flex flex-col items-center">
    <div
      className="w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
      style={{ backgroundColor: "#E8735A" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
      </svg>
    </div>
  </div>
);


const FitBoundsInner = ({ listings }: { listings: ListingWithDetails[] }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || listings.length === 0 || !(window as any).google?.maps) return;
    const gm = (window as any).google.maps;
    const bounds = new gm.LatLngBounds();
    listings.forEach((l) => {
      if (l.latitude && l.longitude) bounds.extend({ lat: l.latitude, lng: l.longitude });
    });
    map.fitBounds(bounds, 50);
    const listener = gm.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z && z > 12) map.setZoom(12);
    });
    return () => gm.event.removeListener(listener);
  }, [listings, map]);

  return null;
};

interface ListingGoogleMapProps {
  listings: ListingWithDetails[];
}

const ClusteredMarkers = ({
  listings,
  onSelect,
}: {
  listings: ListingWithDetails[];
  onSelect: (id: string) => void;
}) => {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<{ [key: string]: Marker }>({});

  useEffect(() => {
    if (!map) return;
    if (!clusterer.current) {
      clusterer.current = new MarkerClusterer({
        map,
        renderer: {
          render: ({ count, position }) => {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="#E8735A" stroke="white" stroke-width="2"/>
              <text x="20" y="25" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${count}</text>
            </svg>`;
            return new google.maps.marker.AdvancedMarkerElement({
              position,
              content: (() => {
                const div = document.createElement("div");
                div.innerHTML = svg;
                return div;
              })(),
              zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
            });
          },
        },
      });
    }
  }, [map]);

  useEffect(() => {
    clusterer.current?.clearMarkers();
    clusterer.current?.addMarkers(Object.values(markersRef.current));
  }, [listings]);

  const setMarkerRef = useCallback((marker: Marker | null, key: string) => {
    if (marker && markersRef.current[key]) return;
    if (!marker && !markersRef.current[key]) return;

    if (marker) {
      markersRef.current[key] = marker;
    } else {
      delete markersRef.current[key];
    }
  }, []);

  return (
    <>
      {listings.map((listing) => (
        <AdvancedMarker
          key={listing.id}
          position={{ lat: listing.latitude!, lng: listing.longitude! }}
          onClick={() => onSelect(listing.id)}
          ref={(marker) => setMarkerRef(marker as unknown as Marker, listing.id)}
        >
          <CoralPin />
        </AdvancedMarker>
      ))}
    </>
  );
};

const MapContent = ({ listings }: ListingGoogleMapProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { listingMapId } = useGoogleMapsConfig();
  const listingsWithCoords = listings.filter((l) => l.latitude && l.longitude);
  const selected = listingsWithCoords.find((l) => l.id === selectedId);

  return (
    <div className="w-full h-[70vh] sm:h-[600px] rounded-lg overflow-hidden border border-border relative">
      <Map
        defaultCenter={{ lat: 30, lng: 0 }}
        defaultZoom={2}
        gestureHandling="greedy"
        rotateControl={false}
        tilt={0}
        disableDefaultUI={false}
        streetViewControl={false}
        zoomControl={false}
        mapTypeControl={false}
        mapId={listingMapId || "listing-map"}
        className="w-full h-full"
      >
        
        <FitBoundsInner listings={listingsWithCoords} />
        <ClusteredMarkers listings={listingsWithCoords} onSelect={setSelectedId} />
        {selected && (
          <InfoWindow
            position={{ lat: selected.latitude!, lng: selected.longitude! }}
            onCloseClick={() => setSelectedId(null)}
          >
            <div className="min-w-[200px] max-w-[260px]">
              {selected.photos?.[0] && (
                <img
                  src={selected.photos[0]}
                  alt={selected.title}
                  className="w-full h-28 object-cover rounded-md mb-2"
                />
              )}
              <p className="font-semibold text-sm mb-1">{selected.title}</p>
              {(selected.city || selected.country) && (
                <p className="text-xs text-muted-foreground">
                  {[selected.city, selected.country].filter(Boolean).join(", ")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const openDate = selected.sit_dates.find((d) => d.status === "open");
                  return openDate
                    ? `${format(new Date(openDate.start_date), "MMM d")} – ${format(new Date(openDate.end_date), "MMM d, yyyy")}`
                    : "Dates TBD";
                })()}
              </p>
              <p className="text-xs mt-1">
                {selected.pets.map((p) => p.name || p.type).join(", ")}
              </p>
              <Link to={`/listing/${selected.id}`}>
                <Button size="sm" className="w-full mt-2 h-8 text-xs">
                  View Listing
                </Button>
              </Link>
            </div>
          </InfoWindow>
        )}
      </Map>
      {listingsWithCoords.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 pointer-events-none">
          <p className="text-muted-foreground text-sm">No listings have location data yet.</p>
        </div>
      )}
    </div>
  );
};

const ListingGoogleMap = ({ listings }: ListingGoogleMapProps) => (
  <GoogleMapsProvider>
    <MapContent listings={listings} />
  </GoogleMapsProvider>
);

export default ListingGoogleMap;
