import { useEffect, useRef, useState, type FocusEvent } from "react";
import { DESKTOP_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";

export type MapLayout = "phone" | "landscape" | "desktop";

/** Phones are at most this many CSS pixels on their short side. */
const PHONE_SHORT_SIDE = 500;

/**
 * A phone turned sideways, decided from the device, never from the page
 * height: an on-screen keyboard shrinks the page (the viewport is set to
 * resizes-content) but doesn't turn the phone. Two signals must agree: the
 * device says landscape, and the page is wider than the phone's short side
 * (the keyboard never changes the width; iPhones report the same screen
 * width either way round).
 */
export const isSidewaysPhone = (): boolean => {
  if (typeof window === "undefined" || typeof screen === "undefined") return false;
  const short = Math.min(screen.width, screen.height);
  if (!short || short > PHONE_SHORT_SIDE) return false;
  const type = screen.orientation?.type;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  const landscape = type ? type.startsWith("landscape") : typeof legacy === "number" ? Math.abs(legacy) === 90 : screen.width > screen.height;
  return landscape && window.innerWidth > short;
};

const useSidewaysPhone = () => {
  const [sideways, setSideways] = useState(isSidewaysPhone);
  useEffect(() => {
    const on = () => setSideways(isSidewaysPhone());
    screen.orientation?.addEventListener?.("change", on);
    window.addEventListener("orientationchange", on);
    // Rotation also resizes the page; a keyboard resize changes nothing here.
    window.addEventListener("resize", on);
    return () => {
      screen.orientation?.removeEventListener?.("change", on);
      window.removeEventListener("orientationchange", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return sideways;
};

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range"].includes(el.type));

export const pickLayout = (desktop: boolean, sideways: boolean): MapLayout => (desktop ? "desktop" : sideways ? "landscape" : "phone");

/**
 * The layout of a full-screen map page. It never changes while a text field
 * on the page has focus (the search would be rebuilt and the keyboard
 * would close); it catches up once the field loses focus. Spread
 * `focusProps` on the page's root element.
 */
export const useMapLayout = () => {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const sideways = useSidewaysPhone();
  const [typing, setTyping] = useState(false);
  const next = pickLayout(desktop, sideways);
  const held = useRef<MapLayout>(next);
  if (!typing) held.current = next;

  const focusProps = {
    onFocus: (e: FocusEvent) => {
      if (isTextField(e.target)) setTyping(true);
    },
    onBlur: (e: FocusEvent) => {
      if (isTextField(e.target) && !isTextField(e.relatedTarget)) setTyping(false);
    },
  };
  return { layout: held.current, typing, focusProps };
};
