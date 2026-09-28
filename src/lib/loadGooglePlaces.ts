let loadPromise: Promise<void> | null = null;

const waitForImportLibrary = (timeoutMs = 10000): Promise<boolean> =>
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if ((window as any).google?.maps?.importLibrary) return resolve(true);
      if (Date.now() - started > timeoutMs) return resolve(false);
      window.setTimeout(tick, 100);
    };
    tick();
  });

/**
 * Loads the Google Maps JS API (places library) once, on demand.
 *
 * Only ONE Maps script may exist per page. Some pages (e.g. /find-nomads) also
 * render a map through @vis.gl/react-google-maps, which injects its own script.
 * So we always reuse an existing loader when one is present — either the
 * google.maps.importLibrary bootstrap or an in-flight script tag — and only
 * inject a script when nothing else is loading the API.
 */
export const loadGooglePlaces = (apiKey: string): Promise<void> => {
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;

  // Google calls this when it refuses the key (API not enabled for the key,
  // or this website isn't in its referrer list). Nothing else reports it.
  if (!(window as any).gm_authFailure) {
    (window as any).gm_authFailure = () =>
      console.warn("[places] Google Maps refused the key. Check the key's API restrictions (Maps JavaScript API, Places API (New), Geocoding API) and website referrers.");
  }

  loadPromise = (async () => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    );

    if ((window as any).google?.maps?.importLibrary || existingScript) {
      const ready = await waitForImportLibrary();
      if (ready) {
        await (window as any).google.maps.importLibrary("places");
        return;
      }
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey,
      )}&libraries=places,marker&loading=async`;
      script.async = true;
      script.defer = true;
      script.dataset.googlePlaces = "true";
      script.onload = async () => {
        // Resolve only once importLibrary exists, so anything waiting on this
        // loader (e.g. the map provider) reuses this script instead of
        // bootstrapping a second one.
        await waitForImportLibrary();
        try {
          await (window as any).google.maps.importLibrary("places");
        } catch {
          // ignore — callers check for availability
        }
        resolve();
      };
      script.onerror = () => {
        loadPromise = null;
        reject(new Error("Failed to load Google Maps"));
      };
      document.head.appendChild(script);
    });
  })();

  return loadPromise;
};
