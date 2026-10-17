import { useEffect, useState } from "react";

/** True while the media query matches; follows changes (resize, rotation). */
export const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
};

/** Desktop layout (lg and up). */
export const DESKTOP_QUERY = "(min-width: 1024px)";
