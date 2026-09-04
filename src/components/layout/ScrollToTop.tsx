import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Every navigation starts at the top of the page. Anchor links (#section)
 * keep their own scroll behaviour so deep links still work.
 */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
