import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { purgeGuideCaches } from "./lib/guideCache";
import { installSignInWatcher } from "./lib/signInEnded";
import { authErrorMeansEnded } from "./lib/signInCheck";
import { supabase } from "./integrations/supabase/client";

// Welcome Guide offline copies never outlive the sit's access window, and old
// guide caches (which could hold Wi-Fi details) are removed.
purgeGuideCaches();

// "Your sign-in has ended": one friendly message instead of failed calls,
// but only once the auth server confirms the session no longer works.
installSignInWatcher(import.meta.env.VITE_SUPABASE_URL, {
  // A network hiccup or auth-server outage never counts as "ended".
  getUser: async () => !authErrorMeansEnded((await supabase.auth.getUser()).error),
  refresh: async () => {
    const { data, error } = await supabase.auth.refreshSession();
    return error ? !authErrorMeansEnded(error) : !!data.session;
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}
