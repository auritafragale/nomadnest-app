import { useEffect } from "react";
import { Map as GoogleMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import { cn } from "@/lib/utils";

// Pins sit on a Nomad's chosen city, never a home, and the map can't zoom in
// past city scale.
const MAX_ZOOM = 12;

export interface CityPin {
  key: string;
  label: string;
  count: number;
  latitude: number;
  longitude: number;
}

const FitBounds = ({ pins }: { pins: CityPin[] }) => {
  const map = useMap();
  useEffect(() => {
    const gm = (window as unknown as { google?: typeof google }).google?.maps;
    if (!map || !gm || pins.length === 0) return;
    const bounds = new gm.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
    map.fitBounds(bounds, 60);
    const listener = gm.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z && z > 10) map.setZoom(10);
    });
    return () => gm.event.removeListener(listener);
  }, [pins, map]);
  return null;
};

/** One numbered pin per shared city. Tapping a pin picks that city. */
const NearMeMap = ({
  pins,
  selected,
  onSelect,
  className,
}: {
  pins: CityPin[];
  selected: string | null;
  onSelect: (key: string) => void;
  className?: string;
}) => (
  <GoogleMapsProvider height="420px">
    <MapInner pins={pins} selected={selected} onSelect={onSelect} className={className} />
  </GoogleMapsProvider>
);

const MapInner = ({ pins, selected, onSelect, className }: { pins: CityPin[]; selected: string | null; onSelect: (key: string) => void; className?: string }) => {
  const { nomadMapId } = useGoogleMapsConfig();
  return (
    <div className={cn("relative h-[420px] w-full overflow-hidden rounded-[22px] border border-border", className)}>
      <GoogleMap
        defaultCenter={{ lat: 30, lng: 0 }}
        defaultZoom={2}
        maxZoom={MAX_ZOOM}
        gestureHandling="greedy"
        rotateControl={false}
        tilt={0}
        streetViewControl={false}
        zoomControl={false}
        mapTypeControl={false}
        mapId={nomadMapId || "nomad-map"}
        style={{ width: "100%", height: "100%" }}
      >
        <FitBounds pins={pins} />
        {pins.map((p) => {
          const on = p.key === selected;
          return (
            <AdvancedMarker key={p.key} position={{ lat: p.latitude, lng: p.longitude }} onClick={() => onSelect(p.key)} zIndex={on ? 1000 : p.count}>
              <button
                type="button"
                aria-label={`${p.count} ${p.count === 1 ? "Nomad" : "Nomads"} in ${p.label}`}
                aria-pressed={on}
                className={cn(
                  "flex h-11 min-w-11 items-center justify-center rounded-full border-2 border-white px-2 text-[15px] font-bold shadow-lg",
                  on ? "bg-[#1F1B16] text-white" : "bg-brand-teal text-[#1F1B16]",
                )}
              >
                {p.count}
              </button>
            </AdvancedMarker>
          );
        })}
      </GoogleMap>
    </div>
  );
};

export default NearMeMap;
