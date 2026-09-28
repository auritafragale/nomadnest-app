import { useEffect, useState } from "react";

/**
 * The visible part of the screen (shrinks when the on-screen keyboard opens).
 * Used to keep a full-screen chat's message box just above the keyboard on
 * iOS and Android. Null where the browser has no visualViewport.
 */
export const useVisualViewport = (enabled = true) => {
  const [box, setBox] = useState<{ height: number; offsetTop: number } | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) {
      setBox(null);
      return;
    }
    const update = () => setBox({ height: vv.height, offsetTop: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return box;
};
