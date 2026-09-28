/**
 * The one Places autocomplete core, shared by every location field and search
 * bar. It uses the Places API (New) (AutocompleteSuggestion + Place) and falls
 * back to the legacy AutocompleteService / PlacesService when the new API
 * returns nothing or isn't enabled for the key.
 *
 * The browser key needs: Maps JavaScript API, Places API (New) and Geocoding
 * API (Places API legacy is optional, fallback only), with website referrer
 * restrictions that include every domain the app runs on. When Google refuses
 * a request, the reason (error name / status only, never the typed text) is
 * logged once so a key problem is easy to spot in the browser console.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type PlaceMode = "cities" | "country" | "address" | "search";

export interface PlacePrediction {
  place_id: string;
  description: string;
  mainText: string;
  /** New API prediction, used to fetch details. */
  _prediction?: Any;
}

export interface PlaceSelection {
  description: string;
  city: string;
  country: string;
  formattedAddress: string;
  latitude?: number;
  longitude?: number;
}

const places = (): Any => (window as Any).google?.maps?.places;

const reported = new Set<string>();
export const reportPlacesProblem = (where: string, reason: unknown) => {
  const r = reason as { name?: string; code?: string; message?: string } | string | undefined;
  const label =
    typeof r === "string" ? r : r?.name && r.name !== "Error" ? r.name : r?.code ?? (r?.message ?? "unknown").slice(0, 80);
  const key = `${where}:${label}`;
  if (reported.has(key)) return;
  reported.add(key);
  console.warn(`[places] ${where} failed: ${label}. Check the Maps key's API and website restrictions.`);
};

export const newPlacesSessionToken = (): Any => {
  const g = places();
  return g?.AutocompleteSessionToken ? new g.AutocompleteSessionToken() : undefined;
};

// Mixing incompatible types makes a request fail, so each mode maps to one
// coherent set (address fields send none and accept any result).
const NEW_TYPES: Record<PlaceMode, string[] | undefined> = {
  cities: ["locality", "administrative_area_level_3"],
  country: ["country"],
  address: undefined,
  search: ["locality", "administrative_area_level_3", "country"],
};
const LEGACY_TYPES: Record<PlaceMode, string[] | undefined> = {
  cities: ["(cities)"],
  country: ["country"],
  address: ["address"],
  search: ["(regions)"],
};

const text = (t: Any): string => t?.toString?.() || t?.text || "";

const legacyPredictions = (input: string, mode: PlaceMode, sessionToken: Any): Promise<PlacePrediction[]> =>
  new Promise((resolve) => {
    const g = places();
    if (!g?.AutocompleteService) {
      resolve([]);
      return;
    }
    const types = LEGACY_TYPES[mode];
    new g.AutocompleteService().getPlacePredictions(
      { input, ...(types ? { types } : {}), sessionToken },
      (results: Any[] | null, status?: string) => {
        if (status && status !== "OK" && status !== "ZERO_RESULTS") reportPlacesProblem("legacy suggestions", status);
        resolve(
          (results || []).slice(0, 6).map((r) => ({
            place_id: r.place_id,
            description: r.description,
            mainText: r.structured_formatting?.main_text || r.description,
          })),
        );
      },
    );
  });

export const fetchPlacePredictions = async (
  input: string,
  mode: PlaceMode,
  sessionToken?: Any,
): Promise<PlacePrediction[]> => {
  const g = places();
  if (!g || input.trim().length < 3) return [];

  if (g.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    try {
      const includedPrimaryTypes = NEW_TYPES[mode];
      const { suggestions } = await g.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        ...(includedPrimaryTypes ? { includedPrimaryTypes } : {}),
        sessionToken: sessionToken ?? undefined,
      });
      const mapped: PlacePrediction[] = (suggestions || [])
        .map((s: Any) => s.placePrediction)
        .filter(Boolean)
        .slice(0, 6)
        .map((p: Any) => ({
          place_id: p.placeId,
          description: text(p.text),
          mainText: text(p.structuredFormat?.mainText) || text(p.text),
          _prediction: p,
        }))
        .filter((p: PlacePrediction) => p.description);
      if (mapped.length > 0) return mapped;
    } catch (err) {
      reportPlacesProblem("suggestions", err);
    }
  }
  return legacyPredictions(input, mode, sessionToken);
};

const parseComponents = (components: Any[] | undefined) => {
  let city = "";
  let country = "";
  components?.forEach((c: Any) => {
    const typesList: string[] = c.types || [];
    const name = c.long_name ?? c.longText ?? "";
    if (typesList.includes("locality")) city = city || name;
    if (typesList.includes("postal_town")) city = city || name;
    if (typesList.includes("administrative_area_level_1")) city = city || name;
    if (typesList.includes("country")) country = country || name;
  });
  return { city, country };
};

/** Details for a picked suggestion (city, country, address, coordinates). */
export const fetchPlaceDetails = async (
  prediction: PlacePrediction,
  sessionToken?: Any,
): Promise<PlaceSelection | null> => {
  if (prediction._prediction?.toPlace) {
    try {
      const place = prediction._prediction.toPlace();
      await place.fetchFields({ fields: ["addressComponents", "formattedAddress", "location", "displayName"] });
      const { city, country } = parseComponents(place.addressComponents);
      return {
        description: prediction.description,
        city,
        country,
        formattedAddress: place.formattedAddress || prediction.description,
        latitude: place.location?.lat?.(),
        longitude: place.location?.lng?.(),
      };
    } catch (err) {
      reportPlacesProblem("place details", err);
      return null;
    }
  }

  const g = places();
  if (!g?.PlacesService) return null;
  return new Promise((resolve) => {
    new g.PlacesService(document.createElement("div")).getDetails(
      {
        placeId: prediction.place_id,
        fields: ["address_components", "formatted_address", "geometry", "name"],
        sessionToken,
      },
      (place: Any, status: string) => {
        if (status !== "OK" || !place) {
          reportPlacesProblem("legacy place details", status);
          resolve(null);
          return;
        }
        const { city, country } = parseComponents(place.address_components);
        resolve({
          description: prediction.description,
          city,
          country,
          formattedAddress: place.formatted_address || prediction.description,
          latitude: place.geometry?.location?.lat?.(),
          longitude: place.geometry?.location?.lng?.(),
        });
      },
    );
  });
};

/** Maps the old `types` prop of PlacesAutocompleteField to a mode. */
export const modeFromTypes = (types: string[]): PlaceMode =>
  types.includes("country")
    ? "country"
    : types.includes("(cities)")
      ? "cities"
      : types.includes("(regions)")
        ? "search"
        : "address";
