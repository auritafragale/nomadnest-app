/**
 * Geocode a city/country string into lat/lng using the Google Maps Geocoding API.
 * Returns null on failure so callers can fail soft.
 */
export async function geocodeCityCountry(
  apiKey: string,
  city?: string | null,
  country?: string | null
): Promise<{ latitude: number; longitude: number } | null> {
  const query = [city, country].filter(Boolean).join(", ").trim();
  if (!query || !apiKey) return null;

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
