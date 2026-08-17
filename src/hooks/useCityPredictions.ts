import { useCallback, useEffect, useRef, useState } from "react";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { loadGooglePlaces } from "@/lib/loadGooglePlaces";

export interface CityPrediction {
  place_id: string;
  description: string;
}

/**
 * Lightweight Google Places city suggestions for search bars.
 * Uses the new Places API (AutocompleteSuggestion) with a fallback to the
 * legacy AutocompleteService for older keys. Debounced, starts at 3 chars.
 */
export const useCityPredictions = (input: string, minChars = 3) => {
  const [predictions, setPredictions] = useState<CityPrediction[]>([]);
  const [ready, setReady] = useState(false);
  const tokenRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  const { data: mapsConfig } = useGoogleMapsKey();

  useEffect(() => {
    if (!mapsConfig?.key) return;
    let cancelled = false;
    loadGooglePlaces(mapsConfig.key)
      .then(() => {
        if (cancelled) return;
        const g = (window as any).google?.maps?.places;
        if (!g) return;
        if (g.AutocompleteSessionToken) tokenRef.current = new g.AutocompleteSessionToken();
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mapsConfig?.key]);

  useEffect(() => {
    const query = input.trim();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (query.length < minChars || !ready) {
      if (query.length < minChars) setPredictions([]);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      const g = (window as any).google?.maps?.places;
      if (!g) return;
      const requestId = ++requestIdRef.current;

      try {
        if (g.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
          const { suggestions } = await g.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            includedPrimaryTypes: ["locality", "administrative_area_level_3", "country"],
            sessionToken: tokenRef.current ?? undefined,
          });
          if (requestId !== requestIdRef.current) return;
          setPredictions(
            (suggestions || [])
              .map((s: any) => s.placePrediction)
              .filter(Boolean)
              .slice(0, 6)
              .map((p: any) => ({
                place_id: p.placeId,
                description: p.text?.toString?.() || p.text?.text || "",
              }))
              .filter((p: CityPrediction) => p.description)
          );
          return;
        }

        // Legacy fallback
        const service = new g.AutocompleteService();
        service.getPlacePredictions(
          { input: query, types: ["(cities)"], sessionToken: tokenRef.current ?? undefined },
          (results: any[] | null) => {
            if (requestId !== requestIdRef.current) return;
            setPredictions(
              (results || []).slice(0, 6).map((r) => ({
                place_id: r.place_id,
                description: r.description,
              }))
            );
          }
        );
      } catch {
        if (requestId === requestIdRef.current) setPredictions([]);
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [input, minChars, ready]);

  const clear = useCallback(() => setPredictions([]), []);

  return { predictions, clear };
};
