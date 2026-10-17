import { useEffect, useRef, useCallback } from "react";
import { Map as GoogleMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Marker, type Cluster } from "@googlemaps/markerclusterer";
import { ListingWithDetails } from "@/hooks/useListings";
import { useTheme } from "@/contexts/ThemeContext";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import { MAP_CONTROLS, WORLD_RESTRICTION, useWorldMinZoom } from "./mapLimits";
import { cn } from "@/lib/utils";

/** Room kept clear of floating cards when fitting the sits. */
export type MapPadding = { top: number; right: number; bottom: number; left: number };
/** Move the map to one sit; `nonce` repeats the move. */
export type SitFocus = { id: string; nonce: number };

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const mapsApi = () => (window as unknown as { google?: typeof google }).google?.maps;

// A sit is a soft area circle, never a pin: listing coordinates are an
// approximate area (a stored random point within ~500 m), so nothing points
// at a house. The picked sit's circle turns coral.
const SitCircle = ({ on }: { on: boolean }) => (
  <div className="relative flex h-16 w-16 items-center justify-center">
    <span className={cn("absolute inset-0 rounded-full border-2", on ? "border-brand-coral bg-brand-coral/25" : "border-brand-teal bg-brand-teal/20")} />
    <span
      className={cn(
        "relative h-3 w-3 rounded-full border-[2.5px] border-[var(--nn-logo-bg)] shadow-[var(--nn-float-shadow)]",
        on ? "bg-brand-coral" : "bg-brand-teal",
      )}
    />
  </div>
);

const Camera = ({ listings, padding, focus }: { listings: ListingWithDetails[]; padding: MapPadding; focus: SitFocus | null }) => {
  const map = useMap();

  // Every sit in view, clear of the floating cards; never closer than zoom 12.
  useEffect(() => {
    const gm = mapsApi();
    if (!map || !gm || listings.length === 0) return;
    const bounds = new gm.LatLngBounds();
    listings.forEach((l) => bounds.extend({ lat: l.latitude!, lng: l.longitude! }));
    map.fitBounds(bounds, padding);
    const listener = gm.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z && z > 12) map.setZoom(12);
    });
    return () => gm.event.removeListener(listener);
  }, [listings, map, padding.top, padding.right, padding.bottom, padding.left]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swiping to a card moves the map to its circle.
  useEffect(() => {
    if (!focus || !map) return;
    const l = listings.find((x) => x.id === focus.id);
    if (!l) return;
    const at = { lat: l.latitude!, lng: l.longitude! };
    if (reducedMotion()) map.setCenter(at);
    else map.panTo(at);
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

const ClusteredCircles = ({
  listings,
  selectedId,
  onPick,
}: {
  listings: ListingWithDetails[];
  selectedId: string | null;
  onPick: (ids: string[]) => void;
}) => {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<{ [key: string]: Marker }>({});
  // Reverse lookup so onClusterClick (bound once, below) can turn the
  // library's Marker instances back into listing ids.
  const markerIdRef = useRef<Map<Marker, string>>(new Map());
  // onClusterClick is registered once, so keep the current handler in a ref.
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!map || clusterer.current) return;
    clusterer.current = new MarkerClusterer({
      map,
      renderer: {
        render: ({ count, position }) => {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="hsl(var(--primary))" stroke="hsl(var(--primary-foreground))" stroke-width="2"/>
              <text x="20" y="25" text-anchor="middle" fill="hsl(var(--primary-foreground))" font-size="14" font-weight="bold">${count}</text>
            </svg>`;
          const div = document.createElement("div");
          div.innerHTML = svg;
          return new google.maps.marker.AdvancedMarkerElement({ position, content: div, zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count });
        },
      },
      // Not the library's "zoom into the cluster": its sits come up in the cards.
      onClusterClick: (_event, cluster: Cluster) => {
        const ids = cluster.markers?.map((m) => markerIdRef.current.get(m as Marker)).filter((id): id is string => Boolean(id));
        if (ids && ids.length > 0) onPickRef.current(ids);
      },
    });
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
      {listings.map((l) => (
        <AdvancedMarker
          key={l.id}
          position={{ lat: l.latitude!, lng: l.longitude! }}
          onClick={() => onPick([l.id])}
          zIndex={l.id === selectedId ? 1000 : undefined}
          title={`Sit area: ${l.title}`}
          ref={(marker) => setMarkerRef(marker as unknown as Marker, l.id)}
        >
          <SitCircle on={l.id === selectedId} />
        </AdvancedMarker>
      ))}
    </>
  );
};

interface ListingGoogleMapProps {
  /** Sits with an area to show (latitude and longitude set). */
  listings: ListingWithDetails[];
  selectedId: string | null;
  /** A circle ([id]) or a cluster (its ids) was tapped. */
  onPick: (ids: string[]) => void;
  padding: MapPadding;
  focus: SitFocus | null;
  className?: string;
}

const MapContent = ({ listings, selectedId, onPick, padding, focus, className }: ListingGoogleMapProps) => {
  const { listingMapId } = useGoogleMapsConfig();
  const { theme } = useTheme();
  const scheme = theme === "dark" ? "DARK" : "LIGHT";
  const { ref, minZoom } = useWorldMinZoom();
  return (
    <div ref={ref} role="region" aria-label="Map of sits" className={cn("relative h-full w-full overflow-hidden", className)}>
      {/* The colour scheme is set when the map starts, so a theme change starts a new one. */}
      <GoogleMap
        key={scheme}
        colorScheme={scheme}
        defaultCenter={{ lat: 30, lng: 0 }}
        defaultZoom={minZoom}
        minZoom={minZoom}
        restriction={WORLD_RESTRICTION}
        gestureHandling="greedy"
        tilt={0}
        {...MAP_CONTROLS}
        clickableIcons={false}
        mapId={listingMapId || "listing-map"}
        className="h-full w-full"
      >
        <Camera listings={listings} padding={padding} focus={focus} />
        <ClusteredCircles listings={listings} selectedId={selectedId} onPick={onPick} />
      </GoogleMap>
    </div>
  );
};

/** Browse Sits map: soft area circles, clustered, filling its container. */
const ListingGoogleMap = (props: ListingGoogleMapProps) => (
  <GoogleMapsProvider height="100%">
    <MapContent {...props} />
  </GoogleMapsProvider>
);

export default ListingGoogleMap;
