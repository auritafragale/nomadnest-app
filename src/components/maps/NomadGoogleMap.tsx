import { useState, useEffect, useRef, useCallback } from "react";
import { Map as GoogleMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Marker, type Cluster } from "@googlemaps/markerclusterer";
import { Backpack } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useStartConversation } from "@/hooks/useConversations";
import { toast } from "@/hooks/use-toast";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import MapCardSheet from "./MapCardSheet";
import NomadMapCard from "./NomadMapCard";
import type { NomadOnMap } from "@/pages/FindNomads";

// Beyond this zoom, clustering stops being meaningful at city scale — pins
// this close together represent the same neighborhood. Capping the map's own
// zoom here (not just the clustering algorithm's) is what actually stops a
// pinch/scroll from ever separating them, since the algorithm's maxZoom only
// controls when it STOPS forming new clusters, not how far the map can zoom.
const MAX_ZOOM = 12;

// Individual (non-clustered) pin. Same circular-badge treatment as
// ListingGoogleMap.tsx's ListingPin, kept visually consistent between both
// maps — only the icon differs. Cluster count badges (built as raw SVG for
// the AdvancedMarkerElement content the clusterer's own renderer constructs)
// are untouched.
const NomadPin = () => (
  <div className="flex flex-col items-center">
    <div className="w-10 h-10 rounded-full border-2 border-white shadow-lg bg-primary flex items-center justify-center">
      <Backpack className="w-5 h-5 text-primary-foreground" />
    </div>
  </div>
);

const FitBoundsInner = ({ nomads }: { nomads: NomadOnMap[] }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || nomads.length === 0 || !(window as any).google?.maps) return;
    const gm = (window as any).google.maps;
    const bounds = new gm.LatLngBounds();
    nomads.forEach((n) => bounds.extend({ lat: n.latitude, lng: n.longitude }));
    map.fitBounds(bounds, 50);
    const listener = gm.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z && z > 10) map.setZoom(10);
    });
    return () => gm.event.removeListener(listener);
  }, [nomads, map]);
  return null;
};

interface NomadGoogleMapProps {
  nomads: NomadOnMap[];
}

const ClusteredNomadMarkers = ({
  nomads,
  onSelect,
  onClusterOpen,
}: {
  nomads: NomadOnMap[];
  onSelect: (id: string) => void;
  onClusterOpen: (ids: string[]) => void;
}) => {
  const map = useMap();
  const clusterer = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<{ [key: string]: Marker }>({});
  // Reverse lookup so onClusterClick (bound once, below) can turn the
  // library's Marker instances back into nomad ids.
  const markerIdRef = useRef<Map<Marker, string>>(new Map());
  const syncHandle = useRef<number | null>(null);
  // onClusterClick is registered once when the clusterer is constructed
  // (below), so it would otherwise close over whichever onClusterOpen was
  // passed on that first render. Keep a ref in sync so it always calls the
  // current one.
  const onClusterOpenRef = useRef(onClusterOpen);
  useEffect(() => {
    onClusterOpenRef.current = onClusterOpen;
  }, [onClusterOpen]);

  const scheduleSync = useCallback(() => {
    if (syncHandle.current !== null) return;
    syncHandle.current = window.requestAnimationFrame(() => {
      syncHandle.current = null;
      if (!clusterer.current) return;
      clusterer.current.clearMarkers();
      clusterer.current.addMarkers(Object.values(markersRef.current));
    });
  }, []);

  useEffect(() => {
    if (!map) return;
    if (!clusterer.current) {
      clusterer.current = new MarkerClusterer({
        map,
        // No algorithmOptions here: the <GoogleMap maxZoom={MAX_ZOOM}> cap below
        // already stops anyone from zooming in past that level, so the
        // clustering algorithm is never evaluated beyond it either — it
        // doesn't need a matching limit of its own. (Passing one here also
        // used to crash production: "TypeError: hf is not a constructor" —
        // algorithmOptions was the one new value flowing into
        // SuperClusterAlgorithm's constructor call into SuperCluster, which
        // previously only ever received an empty default object.)
        renderer: {
          render: ({ count, position }) => {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="20" fill="hsl(var(--primary))" stroke="white" stroke-width="2"/>
              <text x="22" y="27" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${count}</text>
            </svg>`;
            return new google.maps.marker.AdvancedMarkerElement({
              position,
              content: (() => {
                const div = document.createElement("div");
                div.innerHTML = svg;
                return div;
              })(),
              zIndex: 1000 + count,
            });
          },
        },
        // Override the library's default "zoom into cluster bounds" behavior:
        // open the shared bottom-sheet card carousel with every nomad in the
        // cluster instead.
        onClusterClick: (_event, cluster: Cluster) => {
          const ids = cluster.markers
            ?.map((m) => markerIdRef.current.get(m as Marker))
            .filter((id): id is string => Boolean(id));
          if (!ids || ids.length === 0) return;
          onClusterOpenRef.current(ids);
        },
      });
    }
    scheduleSync();
  }, [map, scheduleSync]);

  useEffect(() => {
    scheduleSync();
  }, [nomads, scheduleSync]);

  useEffect(
    () => () => {
      if (syncHandle.current !== null) window.cancelAnimationFrame(syncHandle.current);
    },
    [],
  );

  const setMarkerRef = useCallback(
    (marker: Marker | null, key: string) => {
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
      scheduleSync();
    },
    [scheduleSync],
  );

  return (
    <>
      {nomads.map((nomad) => (
        <AdvancedMarker
          key={nomad.user_id}
          position={{ lat: nomad.latitude, lng: nomad.longitude }}
          onClick={() => onSelect(nomad.user_id)}
          ref={(marker) => setMarkerRef(marker as unknown as Marker, nomad.user_id)}
        >
          <NomadPin />
        </AdvancedMarker>
      ))}
    </>
  );
};

const MapContent = ({ nomads }: NomadGoogleMapProps) => {
  // One list of nomad ids drives the shared bottom-sheet card carousel for
  // both cases: a single-pin click populates it with one id, a cluster click
  // with several. No position tracking needed — the sheet is bottom-anchored
  // to the map's container, not tied to a lat/lng.
  const [mapSelection, setMapSelection] = useState<string[] | null>(null);
  const { nomadMapId } = useGoogleMapsConfig();
  const selectedNomads = mapSelection
    ? nomads.filter((n) => mapSelection.includes(n.user_id))
    : [];
  const navigate = useNavigate();
  const { user } = useAuth();
  const startConversation = useStartConversation();
  const [startingChat, setStartingChat] = useState(false);

  const handleSelect = useCallback((id: string) => {
    setMapSelection([id]);
  }, []);
  const handleClusterOpen = useCallback((ids: string[]) => {
    setMapSelection(ids);
  }, []);

  const handleMessage = async (otherUserId: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setStartingChat(true);
    try {
      const { conversationId } = await startConversation.mutateAsync({
        otherUserId,
        conversationType: "direct",
      });
      navigate(`/inbox?conversation=${conversationId}`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to start conversation. Please try again.",
      });
    } finally {
      setStartingChat(false);
    }
  };

  return (
    <div className="relative w-full aspect-[3/4] min-h-[400px] max-h-[80vh] md:aspect-auto md:h-96 md:max-h-none rounded-lg overflow-hidden border border-border">
      <GoogleMap
        defaultCenter={{ lat: 30, lng: 0 }}
        defaultZoom={2}
        maxZoom={MAX_ZOOM}
        gestureHandling="greedy"
        rotateControl={false}
        tilt={0}
        disableDefaultUI={false}
        streetViewControl={false}
        zoomControl={false}
        mapTypeControl={false}
        mapId={nomadMapId || "nomad-map"}
        style={{ width: "100%", height: "100%" }}
      >
        <FitBoundsInner nomads={nomads} />
        <ClusteredNomadMarkers
          nomads={nomads}
          onSelect={handleSelect}
          onClusterOpen={handleClusterOpen}
        />
      </GoogleMap>
      {mapSelection && (
        <MapCardSheet
          items={selectedNomads}
          getKey={(n) => n.user_id}
          onClose={() => setMapSelection(null)}
          renderCard={(n) => (
            <NomadMapCard nomad={n} onMessage={handleMessage} messaging={startingChat} />
          )}
        />
      )}
    </div>
  );
};

const NomadGoogleMap = ({ nomads }: NomadGoogleMapProps) => (
  <GoogleMapsProvider height="384px">
    <MapContent nomads={nomads} />
  </GoogleMapsProvider>
);

export default NomadGoogleMap;
