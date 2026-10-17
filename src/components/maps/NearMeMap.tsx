import { useEffect } from "react";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import { WorldMap } from "./WorldMap";
import type { MapPadding } from "./mapLimits";
import { cn } from "@/lib/utils";

export type { MapPadding };

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

/** Centre on one pin, or (key null) show every pin. `nonce` repeats it. */
export type MapFocus = { key: string | null; nonce: number };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const Camera = ({ pins, padding, focus }: { pins: CityPin[]; padding: MapPadding; focus: MapFocus | null }) => {
  const map = useMap();
  const gm = (window as unknown as { google?: typeof google }).google?.maps;

  // Every pin in view, clear of the floating cards; never closer than a city.
  const fitAll = () => {
    if (!map || !gm || pins.length === 0) return () => {};
    const bounds = new gm.LatLngBounds();
    pins.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
    map.fitBounds(bounds, padding);
    const listener = gm.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z && z > 10) map.setZoom(10);
    });
    return () => gm.event.removeListener(listener);
  };

  useEffect(fitAll, [pins, map, gm, padding.top, padding.right, padding.bottom, padding.left]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focus || !map) return;
    const pin = focus.key ? pins.find((p) => p.key === focus.key) : null;
    if (!pin) return fitAll();
    const at = { lat: pin.latitude, lng: pin.longitude };
    if (reducedMotion()) map.setCenter(at);
    else map.panTo(at);
    if ((map.getZoom() ?? 0) < 8) map.setZoom(8);
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

/**
 * Nomads Near Me map: one numbered pin per shared city, filling its container.
 * Tapping a pin picks that city. Follows light and dark mode.
 */
const NearMeMap = ({
  pins,
  selected,
  onSelect,
  padding,
  focus,
  className,
}: {
  pins: CityPin[];
  selected: string | null;
  onSelect: (key: string) => void;
  padding: MapPadding;
  focus: MapFocus | null;
  className?: string;
}) => (
  <GoogleMapsProvider height="100%">
    <MapInner pins={pins} selected={selected} onSelect={onSelect} padding={padding} focus={focus} className={className} />
  </GoogleMapsProvider>
);

const MapInner = ({
  pins,
  selected,
  onSelect,
  padding,
  focus,
  className,
}: {
  pins: CityPin[];
  selected: string | null;
  onSelect: (key: string) => void;
  padding: MapPadding;
  focus: MapFocus | null;
  className?: string;
}) => {
  const { nomadMapId } = useGoogleMapsConfig();
  return (
    <WorldMap mapId={nomadMapId || "nomad-map"} label="Map of Nomads nearby" maxZoom={MAX_ZOOM} className={className}>
      <Camera pins={pins} padding={padding} focus={focus} />
      {pins.map((p) => {
        const on = p.key === selected;
        return (
          <AdvancedMarker key={p.key} position={{ lat: p.latitude, lng: p.longitude }} onClick={() => onSelect(p.key)} zIndex={on ? 1000 : p.count}>
            <button
              type="button"
              aria-label={`${p.count} ${p.count === 1 ? "Nomad" : "Nomads"} in ${p.label}`}
              aria-pressed={on}
              className={cn(
                "flex items-center justify-center rounded-full border-[3px] px-2 font-bold text-primary-foreground shadow-float transition-transform",
                on ? "h-[58px] min-w-[58px] border-brand-coral bg-brand-teal text-[17px]" : "h-12 min-w-12 border-[var(--nn-logo-bg)] bg-brand-teal text-[15px]",
              )}
            >
              {p.count}
            </button>
          </AdvancedMarker>
        );
      })}
    </WorldMap>
  );
};

export default NearMeMap;
