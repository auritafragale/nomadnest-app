import { useEffect } from "react";
import { Map as GoogleMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import { MAP_CONTROLS, WORLD_RESTRICTION, useWorldMinZoom } from "./mapLimits";
import { useTheme } from "@/contexts/ThemeContext";
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

/** Room kept clear of floating cards when fitting the pins. */
export type MapPadding = { top: number; right: number; bottom: number; left: number };

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
  const { theme } = useTheme();
  const scheme = theme === "dark" ? "DARK" : "LIGHT";
  const { ref, minZoom } = useWorldMinZoom();
  return (
    <div ref={ref} className={cn("relative h-full w-full overflow-hidden", className)} aria-label="Map of Nomads nearby" role="region">
      {/* The colour scheme is set when the map starts, so a theme change starts a new one. */}
      <GoogleMap
        key={scheme}
        colorScheme={scheme}
        defaultCenter={{ lat: 30, lng: 0 }}
        defaultZoom={minZoom}
        minZoom={minZoom}
        maxZoom={MAX_ZOOM}
        restriction={WORLD_RESTRICTION}
        gestureHandling="greedy"
        tilt={0}
        {...MAP_CONTROLS}
        clickableIcons={false}
        mapId={nomadMapId || "nomad-map"}
        style={{ width: "100%", height: "100%" }}
      >
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
                  "flex items-center justify-center rounded-full border-[3px] px-2 font-bold text-primary-foreground shadow-[var(--nn-float-shadow)] transition-transform",
                  on ? "h-[58px] min-w-[58px] border-brand-coral bg-brand-teal text-[17px]" : "h-12 min-w-12 border-[var(--nn-logo-bg)] bg-brand-teal text-[15px]",
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
