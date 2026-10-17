import { useCallback, useEffect, useState } from "react";

/** Room kept clear of floating cards when a map fits its points. */
export type MapPadding = { top: number; right: number; bottom: number; left: number };
/** Move the map to one point; `nonce` repeats the move. */
export type MapFocus = { id: string; nonce: number };

/**
 * Shared rules for every map in the app.
 *
 * The world always fills the map: members can't zoom out until the world is
 * a thin strip with grey above and below, repeated side by side.
 */
export const WORLD_RESTRICTION = {
  latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
  strictBounds: true,
};

/** Only pinch and drag: no camera square, full screen, keyboard, Street View, map type, zoom or rotate buttons. Google's logo and terms stay. */
export const MAP_CONTROLS = {
  cameraControl: false,
  fullscreenControl: false,
  keyboardShortcuts: false,
  streetViewControl: false,
  mapTypeControl: false,
  zoomControl: false,
  rotateControl: false,
} as const;

/** The smallest zoom at which the world (256px tall at zoom 0) fills a map this tall. Never below 2. */
export const worldMinZoom = (height: number) => (height > 0 ? Math.max(2, Math.ceil(Math.log2(height / 256))) : 2);

/**
 * The minimum zoom for a map container, recomputed when it resizes. Put
 * `ref` on the element that holds the map.
 */
export const useWorldMinZoom = () => {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [minZoom, setMinZoom] = useState(2);
  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);

  useEffect(() => {
    if (!el) return;
    const update = () => setMinZoom(worldMinZoom(el.clientHeight));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  return { ref, minZoom };
};
