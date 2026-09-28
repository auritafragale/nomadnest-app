import { useCallback, useEffect, useRef, useState } from "react";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { loadGooglePlaces } from "@/lib/loadGooglePlaces";
import {
  fetchPlacePredictions,
  newPlacesSessionToken,
  reportPlacesProblem,
  type PlacePrediction,
} from "@/lib/placesAutocomplete";

export type CityPrediction = Pick<PlacePrediction, "place_id" | "description" | "mainText">;

/**
 * City and country suggestions for search bars, from the same Places core as
 * every location field (lib/placesAutocomplete). Debounced, starts at 3 chars.
 */
export const useCityPredictions = (input: string, minChars = 3) => {
  const [predictions, setPredictions] = useState<CityPrediction[]>([]);
  const [ready, setReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        tokenRef.current = newPlacesSessionToken();
        setReady(true);
      })
      .catch((err) => reportPlacesProblem("loading Google Maps", err));
    return () => {
      cancelled = true;
    };
  }, [mapsConfig?.key]);

  useEffect(() => {
    const query = input.trim();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (query.length < minChars || !ready) {
      if (query.length < minChars) {
        requestIdRef.current++;
        setPredictions([]);
      }
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      const results = await fetchPlacePredictions(query, "search", tokenRef.current);
      if (requestId !== requestIdRef.current) return;
      setPredictions(results.map(({ place_id, description, mainText }) => ({ place_id, description, mainText })));
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [input, minChars, ready]);

  const clear = useCallback(() => setPredictions([]), []);

  return { predictions, clear };
};
