import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Map as GoogleMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Cluster, type Marker } from "@googlemaps/markerclusterer";
import { useTheme } from "@/contexts/ThemeContext";
import { MAP_CONTROLS, WORLD_RESTRICTION, useWorldMinZoom, type MapFocus, type MapPadding } from "./mapLimits";
import { cn } from "@/lib/utils";

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const mapsApi = () => (window as unknown as { google?: typeof google }).google?.maps;

/**
 * A full-size map that follows light and dark mode and never zooms out past
 * the world (see mapLimits). Shared by the Browse Sits, Browse Nomads and
 * Nomads Near Me maps.
 */
export const WorldMap = ({
  mapId,
  label,
  maxZoom,
  className,
  children,
}: {
  mapId: string;
  label: string;
  maxZoom?: number;
  className?: string;
  children: ReactNode;
}) => {
  const { theme } = useTheme();
  const scheme = theme === "dark" ? "DARK" : "LIGHT";
  const { ref, minZoom } = useWorldMinZoom();
  return (
    <div ref={ref} role="region" aria-label={label} className={cn("relative h-full w-full overflow-hidden", className)}>
      {/* The colour scheme is set when the map starts, so a theme change starts a new one. */}
      <GoogleMap
        key={scheme}
        colorScheme={scheme}
        defaultCenter={{ lat: 30, lng: 0 }}
        defaultZoom={minZoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        restriction={WORLD_RESTRICTION}
        gestureHandling="greedy"
        tilt={0}
        {...MAP_CONTROLS}
        clickableIcons={false}
        mapId={mapId}
        style={{ width: "100%", height: "100%" }}
      >
        {children}
      </GoogleMap>
    </div>
  );
};

export type MapPoint = { id: string; lat: number; lng: number };

/**
 * Fits every point in view (clear of the floating cards, never closer than
 * `maxFitZoom`), and moves to one point when `focus` changes.
 */
export const FitAndFocus = ({ points, padding, focus, maxFitZoom }: { points: MapPoint[]; padding: MapPadding; focus: MapFocus | null; maxFitZoom: number }) => {
  const map = useMap();

  useEffect(() => {
    const gm = mapsApi();
    if (!map || !gm || points.length === 0) return;
    const bounds = new gm.LatLngBounds();
    points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, padding);
    const listener = gm.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z && z > maxFitZoom) map.setZoom(maxFitZoom);
    });
    return () => gm.event.removeListener(listener);
  }, [points, map, padding.top, padding.right, padding.bottom, padding.left]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focus || !map) return;
    const p = points.find((x) => x.id === focus.id);
    if (!p) return;
    const at = { lat: p.lat, lng: p.lng };
    if (reducedMotion()) map.setCenter(at);
    else map.panTo(at);
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

/**
 * One marker per point, clustered as before. Tapping a marker picks [its id];
 * tapping a cluster picks every id in it (instead of zooming in).
 */
export const ClusteredPins = ({
  points,
  selectedId,
  onPick,
  renderPin,
  titleOf,
}: {
  points: MapPoint[];
  selectedId: string | null;
  onPick: (ids: string[]) => void;
  renderPin: (id: string, selected: boolean) => ReactNode;
  titleOf: (id: string) => string;
}) => {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<{ [key: string]: Marker }>({});
  // Reverse lookup so onClusterClick (bound once) can turn markers back into ids.
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
      onClusterClick: (_event, cluster: Cluster) => {
        const ids = cluster.markers?.map((m) => markerIdRef.current.get(m as Marker)).filter((id): id is string => Boolean(id));
        if (ids && ids.length > 0) onPickRef.current(ids);
      },
    });
  }, [map]);

  useEffect(() => {
    clusterer.current?.clearMarkers();
    clusterer.current?.addMarkers(Object.values(markersRef.current));
  }, [points]);

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
      {points.map((p) => (
        <AdvancedMarker
          key={p.id}
          position={{ lat: p.lat, lng: p.lng }}
          onClick={() => onPick([p.id])}
          zIndex={p.id === selectedId ? 1000 : undefined}
          title={titleOf(p.id)}
          ref={(marker) => setMarkerRef(marker as unknown as Marker, p.id)}
        >
          {renderPin(p.id, p.id === selectedId)}
        </AdvancedMarker>
      ))}
    </>
  );
};
