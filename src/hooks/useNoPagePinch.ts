import { useEffect } from "react";

/**
 * Full-screen map pages only. Safari on iPhone ignores user-scalable=no, so a
 * pinch that starts on a floating card, pill or the header would zoom the
 * whole page. Safari's gesture events are cancelled while the page is open;
 * the map still pinches (it uses touch events). Removed when leaving.
 */
export const useNoPagePinch = () => {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const opts: AddEventListenerOptions = { passive: false };
    document.addEventListener("gesturestart", stop, opts);
    document.addEventListener("gesturechange", stop, opts);
    return () => {
      document.removeEventListener("gesturestart", stop, opts);
      document.removeEventListener("gesturechange", stop, opts);
    };
  }, []);
};
