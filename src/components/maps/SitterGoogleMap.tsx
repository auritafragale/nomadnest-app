import { useState, useEffect, useRef, useCallback } from "react";
import { Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Marker } from "@googlemaps/markerclusterer";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Star, CheckCircle, MapPin } from "lucide-react";
import { SitterWithProfile } from "@/hooks/useSitters";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import MessageSitterButton from "@/components/browse/MessageSitterButton";


const AvatarPin = ({ sitter }: { sitter: SitterWithProfile }) => {
  const name = sitter.profile
    ? `${sitter.profile.first_name || ""} ${sitter.profile.last_name || ""}`.trim()
    : "?";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <div className="relative flex flex-col items-center">
      <div className="w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden"
        style={{ backgroundColor: "#E8735A" }}>
        {sitter.profile?.avatar_url ? (
          <img
            src={sitter.profile.avatar_url}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
        )}
      </div>
      {/* Small triangle pointer below */}
      <div
        className="w-0 h-0"
        style={{
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: "6px solid white",
          filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.3))",
        }}
      />
    </div>
  );
};


const FitBoundsInner = ({ sitters }: { sitters: SitterWithProfile[] }) => {
  const map = useMap();
  useEffect(() => {
    if (!map || sitters.length === 0 || !(window as any).google?.maps) return;
    const gm = (window as any).google.maps;
    const bounds = new gm.LatLngBounds();
    sitters.forEach((s) => {
      if (s.latitude && s.longitude) bounds.extend({ lat: s.latitude, lng: s.longitude });
    });
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 80);
      const listener = gm.event.addListenerOnce(map, "idle", () => {
        const z = map.getZoom();
        if (z && z > 10) map.setZoom(10);
      });
      return () => gm.event.removeListener(listener);
    }
  }, [sitters, map]);
  return null;
};

const ClusteredSitterMarkers = ({
  sitters,
  onSelect,
}: {
  sitters: SitterWithProfile[];
  onSelect: (userId: string) => void;
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
            const div = document.createElement("div");
            div.innerHTML = svg;
            return new google.maps.marker.AdvancedMarkerElement({
              position,
              content: div,
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
  }, [sitters]);

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
      {sitters.map((sitter) => (
        <AdvancedMarker
          key={sitter.user_id}
          position={{ lat: sitter.latitude!, lng: sitter.longitude! }}
          onClick={() => onSelect(sitter.user_id)}
          ref={(marker) => setMarkerRef(marker as unknown as Marker, sitter.user_id)}
        >
          <AvatarPin sitter={sitter} />
        </AdvancedMarker>
      ))}
    </>
  );
};

const SitterInfoWindow = ({ sitter, onClose }: { sitter: SitterWithProfile; onClose: () => void }) => {
  const name = sitter.profile
    ? `${sitter.profile.first_name || ""} ${sitter.profile.last_name || ""}`.trim() || "Nomad"
    : "Nomad";
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const location = sitter.profile
    ? [sitter.profile.city, sitter.profile.country].filter(Boolean).join(", ")
    : null;
  const { average, count } = sitter.rating;

  return (
    <InfoWindow
      position={{ lat: sitter.latitude!, lng: sitter.longitude! }}
      onCloseClick={onClose}
      pixelOffset={[0, -52]}
    >
      <div className="min-w-[180px] max-w-[220px] font-sans">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border border-border"
            style={{ backgroundColor: "#E8735A" }}>
            {sitter.profile?.avatar_url ? (
              <img src={sitter.profile.avatar_url} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{name}</p>
            {sitter.id_verified && (
              <div className="flex items-center gap-0.5 text-primary">
                <CheckCircle className="w-3 h-3" />
                <span className="text-xs">Verified</span>
              </div>
            )}
          </div>
        </div>

        {location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {location}
          </p>
        )}

        {count > 0 && (
          <div className="flex items-center gap-0.5 text-xs mb-1">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span className="font-medium">{average.toFixed(1)}</span>
            <span className="text-muted-foreground">({count})</span>
          </div>
        )}

        {sitter.headline && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{sitter.headline}</p>
        )}

        <Link to={`/sitter/${sitter.user_id}`}>
          <Button size="sm" className="w-full h-7 text-xs" style={{ backgroundColor: "#E8735A", color: "white" }}>
            View Profile
          </Button>
        </Link>
      </div>
    </InfoWindow>
  );
};

interface SitterGoogleMapProps {
  sitters: SitterWithProfile[];
}

const MapContent = ({ sitters }: SitterGoogleMapProps) => {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { nomadMapId } = useGoogleMapsConfig();

  const sittersWithCoords = sitters.filter((s) => s.latitude && s.longitude);
  const selected = sittersWithCoords.find((s) => s.user_id === selectedUserId) || null;

  return (
    <div className="w-full h-[600px] rounded-lg overflow-hidden border border-border relative">
      <Map
        defaultCenter={{ lat: 25, lng: 10 }}
        defaultZoom={2}
        gestureHandling="greedy"
        disableDefaultUI={false}
        streetViewControl={false}
        zoomControl={false}
        mapTypeControl={false}
        mapId={nomadMapId || "nomad-map"}
        className="w-full h-full"
        onClick={() => setSelectedUserId(null)}
      >
        
        <FitBoundsInner sitters={sittersWithCoords} />
        <ClusteredSitterMarkers
          sitters={sittersWithCoords}
          onSelect={setSelectedUserId}
        />
        {selected && (
          <SitterInfoWindow
            sitter={selected}
            onClose={() => setSelectedUserId(null)}
          />
        )}
      </Map>

      {sittersWithCoords.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 pointer-events-none">
          <p className="text-muted-foreground text-sm">No nomads with location data yet.</p>
        </div>
      )}

      {sittersWithCoords.length > 0 && sitters.length > sittersWithCoords.length && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/90 text-xs text-muted-foreground px-3 py-1.5 rounded-full border border-border shadow pointer-events-none">
          Showing {sittersWithCoords.length} of {sitters.length} nomads (location visible)
        </div>
      )}
    </div>
  );
};

const SitterGoogleMap = ({ sitters }: SitterGoogleMapProps) => (
  <GoogleMapsProvider>
    <MapContent sitters={sitters} />
  </GoogleMapsProvider>
);

export default SitterGoogleMap;
