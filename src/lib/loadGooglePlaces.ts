let loadPromise: Promise<void> | null = null;

/**
 * Loads the Google Maps JS API (places library) once, on demand.
 * Safe to call from any component; resolves immediately if already loaded.
 */
export const loadGooglePlaces = (apiKey: string): Promise<void> => {
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-google-places]");
    if (existing) {
      existing.addEventListener("load", async () => {
        try {
          await (window as any).google.maps.importLibrary("places");
        } catch {
          // ignore
        }
        resolve();
      });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.dataset.googlePlaces = "true";
    script.onload = async () => {
      try {
        await (window as any).google.maps.importLibrary("places");
        resolve();
      } catch {
        resolve();
      }
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
};
