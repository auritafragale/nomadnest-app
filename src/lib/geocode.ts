import { loadGooglePlaces } from "@/lib/loadGooglePlaces";

/**
 * Turns a city/country pair into coordinates.
 *
 * The project's Maps key is referrer-restricted, and Google rejects such keys
 * on the Geocoding web service ("API keys with referer restrictions cannot be
 * used with this API"), which silently left profiles without coordinates. The
 * in-browser Geocoder from the Maps JS API accepts referrer-restricted keys, so
 * it is used first, with the web service kept as a last-resort fallback.
 *
 * Returns null on failure so callers can fail soft.
 */
export async function geocodeCityCountry(
  apiKey: string,
  city?: string | null,
  country?: string | null
): Promise<{ latitude: number; longitude: number } | null> {
  const query = [city, country].filter(Boolean).join(", ").trim();
  if (!query || !apiKey) return null;

  // 1. Browser Geocoder (works with referrer-restricted keys).
  try {
    await loadGooglePlaces(apiKey);
    const maps = (window as unknown as { google?: { maps?: any } }).google?.maps;
    if (maps?.Geocoder) {
      const geocoder = new maps.Geocoder();
      const result = await geocoder.geocode({ address: query });
      const loc = result?.results?.[0]?.geometry?.location;
      if (loc) {
        const latitude = typeof loc.lat === "function" ? loc.lat() : loc.lat;
        const longitude = typeof loc.lng === "function" ? loc.lng() : loc.lng;
        if (typeof latitude === "number" && typeof longitude === "number") {
          return { latitude, longitude };
        }
      }
    }
  } catch (e) {
    console.warn("geocodeCityCountry (browser) failed", e);
  }

  // 2. Web service fallback.
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
    return { latitude: loc.lat, longitude: loc.lng };
  } catch (e) {
    console.warn("geocodeCityCountry failed", e);
    return null;
  }
}
