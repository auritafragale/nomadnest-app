import { useState, useEffect, useRef, useCallback } from "react";
import { Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer, type Marker } from "@googlemaps/markerclusterer";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import type { NomadOnMap } from "@/pages/FindNomads";

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
}: {
  nomads: NomadOnMap[];
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
  }, [nomads]);

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

const MapContent = ({ nomads }: NomadGoogleMapProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { nomadMapId } = useGoogleMapsConfig();
  const selected = nomads.find((n) => n.user_id === selectedId);

  return (
    <div className="w-full aspect-[4/5] min-h-[320px] max-h-[75vh] md:aspect-auto md:h-96 md:max-h-none rounded-lg overflow-hidden border border-border">
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
        mapId={nomadMapId || "nomad-map"}
        style={{ width: "100%", height: "100%" }}
      >
        <FitBoundsInner nomads={nomads} />
        <ClusteredNomadMarkers nomads={nomads} onSelect={setSelectedId} />
        {selected && (() => {
          const name = `${selected.profile?.first_name || ""} ${selected.profile?.last_name || ""}`.trim() || "Nomad";
          const location = [selected.profile?.city, selected.profile?.country].filter(Boolean).join(", ");
          return (
            <InfoWindow
              position={{ lat: selected.latitude, lng: selected.longitude }}
              onCloseClick={() => setSelectedId(null)}
            >
              <div className="min-w-[180px] text-center">
                {selected.profile?.avatar_url && (
                  <div className="flex justify-center mb-2">
                    <img
                      src={selected.profile.avatar_url}
                      alt={name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  </div>
                )}
                <p className="font-semibold text-sm">{name}</p>
                {selected.profile?.founding_member && (
                  <div className="flex justify-center mt-1">
                    <FoundingMemberBadge />
                  </div>
                )}
                {selected.headline && (
                  <p className="text-xs text-gray-500 mt-1">{selected.headline}</p>
                )}
                {location && (
                  <p className="text-xs text-gray-500 mt-1">📍 {location}</p>
                )}
                {selected.pet_types && selected.pet_types.length > 0 && (
                  <p className="text-xs mt-1">{selected.pet_types.join(", ")}</p>
                )}
                <div className="flex gap-2 mt-2">
                  <Link to={`/sitter/${selected.user_id}`} className="flex-1">
                    <Button size="sm" className="w-full h-7 text-xs">View Profile</Button>
                  </Link>
                  <Link to={`/inbox?user=${selected.user_id}`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs">Message</Button>
                  </Link>
                </div>
              </div>
            </InfoWindow>
          );
        })()}
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
