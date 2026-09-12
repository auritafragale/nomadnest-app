import { useState, useEffect, useRef, useCallback } from "react";
import { Map as GoogleMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Marker, type Cluster } from "@googlemaps/markerclusterer";
import { PawPrint } from "lucide-react";
import { ListingWithDetails } from "@/hooks/useListings";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import MapCardSheet from "./MapCardSheet";
import ListingMapCard from "./ListingMapCard";

// Individual (non-clustered) pin. Same circular-badge treatment as
// NomadGoogleMap.tsx's NomadPin, kept visually consistent between both
// maps — only the icon differs. Cluster count badges (built as raw SVG for
// the AdvancedMarkerElement content the clusterer's own renderer constructs)
// are untouched.
const ListingPin = () => (
  <div className="flex flex-col items-center">
    <div className="w-10 h-10 rounded-full border-2 border-white shadow-lg bg-primary flex items-center justify-center">
      <PawPrint className="w-5 h-5 text-primary-foreground" />
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
  onClusterOpen,
}: {
  listings: ListingWithDetails[];
  onSelect: (id: string) => void;
  onClusterOpen: (ids: string[]) => void;
}) => {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<{ [key: string]: Marker }>({});
  // Reverse lookup so onClusterClick (bound once, below) can turn the
  // library's Marker instances back into listing ids. Same pattern as
  // NomadGoogleMap.tsx's ClusteredNomadMarkers.
  const markerIdRef = useRef<Map<Marker, string>>(new Map());
  // onClusterClick is registered once when the clusterer is constructed
  // (below), so it would otherwise close over whichever onClusterOpen was
  // passed on that first render. Keep a ref in sync so it always calls the
  // current one.
  const onClusterOpenRef = useRef(onClusterOpen);
  useEffect(() => {
    onClusterOpenRef.current = onClusterOpen;
  }, [onClusterOpen]);

  useEffect(() => {
    if (!map) return;
    if (!clusterer.current) {
      clusterer.current = new MarkerClusterer({
        map,
        renderer: {
          render: ({ count, position }) => {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="hsl(var(--primary))" stroke="hsl(var(--primary-foreground))" stroke-width="2"/>
              <text x="20" y="25" text-anchor="middle" fill="hsl(var(--primary-foreground))" font-size="14" font-weight="bold">${count}</text>
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
        // Override the library's default "zoom into cluster bounds" behavior:
        // open the shared bottom-sheet card carousel with every listing in
        // the cluster instead.
        onClusterClick: (_event, cluster: Cluster) => {
          const ids = cluster.markers
            ?.map((m) => markerIdRef.current.get(m as Marker))
            .filter((id): id is string => Boolean(id));
          if (!ids || ids.length === 0) return;
          onClusterOpenRef.current(ids);
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
      markerIdRef.current.set(marker, key);
    } else {
      const existing = markersRef.current[key];
      if (existing) markerIdRef.current.delete(existing);
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
          <ListingPin />
        </AdvancedMarker>
      ))}
    </>
  );
};

const MapContent = ({ listings }: ListingGoogleMapProps) => {
  // One list of listing ids drives the shared bottom-sheet card carousel for
  // both cases: a single-pin click populates it with one id, a cluster click
  // with several. No position tracking needed — the sheet is bottom-anchored
  // to the map's container, not tied to a lat/lng.
  const [mapSelection, setMapSelection] = useState<string[] | null>(null);
  const { listingMapId } = useGoogleMapsConfig();
  const listingsWithCoords = listings.filter((l) => l.latitude && l.longitude);
  const selectedListings = mapSelection
    ? listingsWithCoords.filter((l) => mapSelection.includes(l.id))
    : [];

  const handleSelect = useCallback((id: string) => {
    setMapSelection([id]);
  }, []);
  const handleClusterOpen = useCallback((ids: string[]) => {
    setMapSelection(ids);
  }, []);

  return (
    <div className="w-full aspect-[3/4] min-h-[460px] max-h-[82vh] sm:aspect-auto sm:h-[600px] sm:max-h-none rounded-lg overflow-hidden border border-border relative">
      <GoogleMap
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
        <ClusteredMarkers
          listings={listingsWithCoords}
          onSelect={handleSelect}
          onClusterOpen={handleClusterOpen}
        />
      </GoogleMap>
      {mapSelection && (
        <MapCardSheet
          items={selectedListings}
          getKey={(l) => l.id}
          onClose={() => setMapSelection(null)}
          renderCard={(l) => <ListingMapCard listing={l} />}
        />
      )}
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
