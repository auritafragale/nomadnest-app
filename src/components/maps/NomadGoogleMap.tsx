import { useState, useEffect, useRef, useCallback } from "react";
import { Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Marker, type Cluster } from "@googlemaps/markerclusterer";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStartConversation } from "@/hooks/useConversations";
import { toast } from "@/hooks/use-toast";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import type { NomadOnMap } from "@/pages/FindNomads";

// Beyond this zoom, clustering stops being meaningful at city scale — pins
// this close together represent the same neighborhood. Capping the map's own
// zoom here (not just the clustering algorithm's) is what actually stops a
// pinch/scroll from ever separating them, since the algorithm's maxZoom only
// controls when it STOPS forming new clusters, not how far the map can zoom.
const MAX_ZOOM = 12;

interface ClusterSelection {
  ids: string[];
  position: { lat: number; lng: number };
}

const NomadPin = ({ avatarUrl, initials }: { avatarUrl?: string | null; initials: string }) => (
  <div className="flex flex-col items-center">
    <div className="w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden bg-primary">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-primary-foreground">
          {initials}
        </div>
      )}
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
  onClusterOpen: (selection: ClusterSelection) => void;
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
        // Matches the hard cap on the <Map> itself (MAX_ZOOM): once the map
        // reaches this zoom, the algorithm stops splitting clusters further,
        // and the map can't zoom in any closer to try.
        algorithmOptions: { maxZoom: MAX_ZOOM },
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
        // open a scrollable list of every nomad in the cluster instead.
        onClusterClick: (_event, cluster: Cluster) => {
          const ids = cluster.markers
            ?.map((m) => markerIdRef.current.get(m as Marker))
            .filter((id): id is string => Boolean(id));
          if (!ids || ids.length === 0) return;
          const pos = cluster.position;
          onClusterOpenRef.current({
            ids,
            position: { lat: pos.lat(), lng: pos.lng() },
          });
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
      {nomads.map((nomad) => {
        const name = `${nomad.profile?.first_name || ""} ${nomad.profile?.last_name || ""}`.trim() || "Nomad";
        const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
        return (
          <AdvancedMarker
            key={nomad.user_id}
            position={{ lat: nomad.latitude, lng: nomad.longitude }}
            onClick={() => onSelect(nomad.user_id)}
            ref={(marker) => setMarkerRef(marker as unknown as Marker, nomad.user_id)}
          >
            <NomadPin avatarUrl={nomad.profile?.avatar_url} initials={initials} />
          </AdvancedMarker>
        );
      })}
    </>
  );
};

/** Profile-card content shared by the single-nomad InfoWindow and each row of a cluster's list. */
const NomadCard = ({
  nomad,
  onMessage,
  messaging,
}: {
  nomad: NomadOnMap;
  onMessage: (userId: string) => void;
  messaging: boolean;
}) => {
  const name = `${nomad.profile?.first_name || ""} ${nomad.profile?.last_name || ""}`.trim() || "Nomad";
  const location = [nomad.profile?.city, nomad.profile?.country].filter(Boolean).join(", ");
  return (
    <div className="min-w-[180px] text-center">
      {nomad.profile?.avatar_url && (
        <div className="flex justify-center mb-2">
          <img
            src={nomad.profile.avatar_url}
            alt={name}
            className="w-12 h-12 rounded-full object-cover"
          />
        </div>
      )}
      <p className="font-semibold text-sm">{name}</p>
      {nomad.profile?.founding_member && (
        <div className="flex justify-center mt-1">
          <FoundingMemberBadge />
        </div>
      )}
      {nomad.headline && <p className="text-xs text-gray-500 mt-1">{nomad.headline}</p>}
      {location && <p className="text-xs text-gray-500 mt-1">📍 {location}</p>}
      {nomad.pet_types && nomad.pet_types.length > 0 && (
        <p className="text-xs mt-1">{nomad.pet_types.join(", ")}</p>
      )}
      <div className="flex gap-2 mt-2">
        <Link to={`/sitter/${nomad.user_id}`} className="flex-1">
          <Button size="sm" className="w-full h-7 text-xs">View Profile</Button>
        </Link>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 w-full h-7 text-xs"
          onClick={() => onMessage(nomad.user_id)}
          disabled={messaging}
        >
          {messaging && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Message
        </Button>
      </div>
    </div>
  );
};

const MapContent = ({ nomads }: NomadGoogleMapProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clusterSelection, setClusterSelection] = useState<ClusterSelection | null>(null);
  const { nomadMapId } = useGoogleMapsConfig();
  const selected = nomads.find((n) => n.user_id === selectedId);
  const clusterNomads = clusterSelection
    ? nomads.filter((n) => clusterSelection.ids.includes(n.user_id))
    : [];
  const navigate = useNavigate();
  const { user } = useAuth();
  const startConversation = useStartConversation();
  const [startingChat, setStartingChat] = useState(false);

  // Only one InfoWindow (single-nomad or cluster-list) is ever open at a time.
  const handleSelect = useCallback((id: string) => {
    setClusterSelection(null);
    setSelectedId(id);
  }, []);
  const handleClusterOpen = useCallback((selection: ClusterSelection) => {
    setSelectedId(null);
    setClusterSelection(selection);
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
    <div className="w-full aspect-[4/5] min-h-[320px] max-h-[75vh] md:aspect-auto md:h-96 md:max-h-none rounded-lg overflow-hidden border border-border">
      <Map
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
        {selected && (
          <InfoWindow
            position={{ lat: selected.latitude, lng: selected.longitude }}
            onCloseClick={() => setSelectedId(null)}
          >
            <NomadCard nomad={selected} onMessage={handleMessage} messaging={startingChat} />
          </InfoWindow>
        )}
        {clusterSelection && clusterNomads.length > 0 && (
          <InfoWindow
            position={clusterSelection.position}
            onCloseClick={() => setClusterSelection(null)}
          >
            {clusterNomads.length === 1 ? (
              <NomadCard nomad={clusterNomads[0]} onMessage={handleMessage} messaging={startingChat} />
            ) : (
              <div className="w-56">
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  {clusterNomads.length} nomads here
                </p>
                <div className="max-h-64 overflow-y-auto divide-y divide-border -mx-1">
                  {clusterNomads.map((n) => (
                    <div key={n.user_id} className="px-1 py-2 first:pt-0 last:pb-0">
                      <NomadCard nomad={n} onMessage={handleMessage} messaging={startingChat} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </InfoWindow>
        )}
      </Map>
    </div>
  );
};

const NomadGoogleMap = ({ nomads }: NomadGoogleMapProps) => (
  <GoogleMapsProvider height="384px">
    <MapContent nomads={nomads} />
  </GoogleMapsProvider>
);

export default NomadGoogleMap;
