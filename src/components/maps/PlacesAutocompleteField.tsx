import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { loadGooglePlaces } from "@/lib/loadGooglePlaces";
import {
  fetchPlaceDetails,
  fetchPlacePredictions,
  modeFromTypes,
  newPlacesSessionToken,
  reportPlacesProblem,
  type PlacePrediction,
  type PlaceSelection,
} from "@/lib/placesAutocomplete";

export type { PlaceSelection };

interface PlacesAutocompleteFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: PlaceSelection) => void;
  onBlur?: () => void;
  /** ["(cities)"], ["country"] or ["address"]. */
  types: string[];
  placeholder?: string;
  showIcon?: boolean;
  className?: string;
}

/**
 * The app's location field: Google Places suggestions in a shadcn-styled
 * dropdown (shared core in lib/placesAutocomplete). Manual typing always works.
 */
const PlacesAutocompleteField = ({
  id,
  value,
  onChange,
  onSelect,
  onBlur,
  types,
  placeholder,
  showIcon = true,
  className,
}: PlacesAutocompleteFieldProps) => {
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [ready, setReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const pendingInputRef = useRef<string | null>(null);
  const mode = modeFromTypes(types);

  // The Places library isn't on every page (no map on most forms), so load it here.
  const { data: mapsConfig, error: keyError } = useGoogleMapsKey();

  useEffect(() => {
    if (keyError) reportPlacesProblem("loading the Maps key", keyError);
  }, [keyError]);

  useEffect(() => {
    if (!mapsConfig?.key) return;
    let cancelled = false;
    loadGooglePlaces(mapsConfig.key)
      .then(() => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(window as any).google?.maps?.places) {
          reportPlacesProblem("loading the Places library", "places library missing");
          return;
        }
        sessionTokenRef.current = newPlacesSessionToken();
        setReady(true);
      })
      .catch((err) => reportPlacesProblem("loading Google Maps", err));
    return () => {
      cancelled = true;
    };
  }, [mapsConfig?.key]);

  const runPredictions = useCallback(
    async (input: string) => {
      const requestId = ++requestIdRef.current;
      const results = await fetchPlacePredictions(input, mode, sessionTokenRef.current);
      if (requestId !== requestIdRef.current) return;
      setPredictions(results);
      setHighlight(0);
    },
    [mode],
  );

  // Run any input typed before Google finished loading.
  useEffect(() => {
    if (ready && pendingInputRef.current) {
      runPredictions(pendingInputRef.current);
      pendingInputRef.current = null;
    }
  }, [ready, runPredictions]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    setOpen(true);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (v.trim().length < 3) {
      requestIdRef.current++;
      setPredictions([]);
      return;
    }
    if (!ready) {
      pendingInputRef.current = v;
      return;
    }
    debounceRef.current = window.setTimeout(() => runPredictions(v), 250);
  };

  const handleSelect = async (prediction: PlacePrediction) => {
    setOpen(false);
    setPredictions([]);
    const place = await fetchPlaceDetails(prediction, sessionTokenRef.current);
    // A session ends with the details request.
    sessionTokenRef.current = newPlacesSessionToken();
    if (place) onSelect(place);
    else onChange(prediction.description);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || predictions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, predictions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(predictions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {showIcon && (
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
      )}
      <Input
        id={id}
        value={value}
        onChange={handleChange}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && predictions.length > 0}
        aria-autocomplete="list"
        className={cn(showIcon && "pl-10", className)}
      />
      {open && predictions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md overflow-hidden"
        >
          {predictions.map((p, i) => (
            <li
              key={p.place_id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(p);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer",
                i === highlight ? "bg-accent text-accent-foreground" : ""
              )}
            >
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="truncate">{p.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PlacesAutocompleteField;
