import { useState, useEffect } from "react";
import { Map, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import GoogleMapsProvider from "./GoogleMapsProvider";
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

const MapContent = ({ nomads }: NomadGoogleMapProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nomads.find((n) => n.user_id === selectedId);

  return (
    <div className="w-full h-[600px] rounded-lg overflow-hidden border border-border">
      <Map
        defaultCenter={{ lat: 30, lng: 0 }}
        defaultZoom={2}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapId="nomad-map"
        className="w-full h-full"
      >
        <FitBoundsInner nomads={nomads} />
        {nomads.map((nomad) => {
          const name = `${nomad.profile?.first_name || ""} ${nomad.profile?.last_name || ""}`.trim() || "Nomad";
          const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
          return (
            <AdvancedMarker
              key={nomad.user_id}
              position={{ lat: nomad.latitude, lng: nomad.longitude }}
              onClick={() => setSelectedId(nomad.user_id)}
            >
              <NomadPin avatarUrl={nomad.profile?.avatar_url} initials={initials} />
            </AdvancedMarker>
          );
        })}
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
  <GoogleMapsProvider>
    <MapContent nomads={nomads} />
  </GoogleMapsProvider>
);

export default NomadGoogleMap;
