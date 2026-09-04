import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { loadGooglePlaces } from "@/lib/loadGooglePlaces";


export interface PlaceSelection {
  description: string;
  city: string;
  country: string;
  formattedAddress: string;
  latitude?: number;
  longitude?: number;
}

interface PlacesAutocompleteFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: PlaceSelection) => void;
  onBlur?: () => void;
  types: string[];
  placeholder?: string;
  showIcon?: boolean;
  className?: string;
}

/**
 * Shadcn-styled Places autocomplete. Uses legacy AutocompleteService for
 * predictions and renders a custom dropdown so the suggestions match the
 * rest of the design system. Manual typing always works.
 */
const PlacesAutocompleteField = ({
  id,
  value,
  onChange,
  onSelect,
  types,
  placeholder,
  showIcon = true,
  className,
}: PlacesAutocompleteFieldProps) => {
  const [predictions, setPredictions] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [ready, setReady] = useState(false);
  const serviceRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const pendingInputRef = useRef<string | null>(null);

  // The Places library is not guaranteed to be on the page (create listing and
  // onboarding have no map), so load it here before initialising services.
  const { data: mapsConfig } = useGoogleMapsKey();

  useEffect(() => {
    if (!mapsConfig?.key) return;
    let cancelled = false;
    loadGooglePlaces(mapsConfig.key)
      .then(() => {
        if (cancelled) return;
        const g = (window as any).google?.maps?.places;
        if (!g) return;
        if (g.AutocompleteSessionToken) sessionTokenRef.current = new g.AutocompleteSessionToken();
        if (!g.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
          serviceRef.current = new g.AutocompleteService();
          placesServiceRef.current = new g.PlacesService(document.createElement("div"));
        }
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mapsConfig?.key]);

  // Primary types for the new Places API. Mixing incompatible types makes the
  // request fail, so each field maps to one coherent set (address fields send
  // none at all and accept any result).
  const includedPrimaryTypes = types.includes("country")
    ? ["country"]
    : types.includes("(cities)") || types.includes("(regions)")
      ? ["locality", "administrative_area_level_3"]
      : undefined;

  const fetchPredictions = useCallback(
    async (input: string) => {
      const g = (window as any).google?.maps?.places;
      if (!g || input.trim().length < 3) {
        setPredictions([]);
        return;
      }
      const requestId = ++requestIdRef.current;

      const legacy = () => {
        if (!serviceRef.current) {
          if (g.AutocompleteService) {
            serviceRef.current = new g.AutocompleteService();
            placesServiceRef.current = new g.PlacesService(document.createElement("div"));
          } else {
            setPredictions([]);
            return;
          }
        }
        serviceRef.current.getPlacePredictions(
          { input, types, sessionToken: sessionTokenRef.current },
          (results: any[] | null) => {
            if (requestId !== requestIdRef.current) return;
            setPredictions((results || []).slice(0, 6));
            setHighlight(0);
          },
        );
      };

      if (g.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
        try {
          const { suggestions } = await g.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            ...(includedPrimaryTypes ? { includedPrimaryTypes } : {}),
            sessionToken: sessionTokenRef.current ?? undefined,
          });
          if (requestId !== requestIdRef.current) return;
          const mapped = (suggestions || [])
            .map((s: any) => s.placePrediction)
            .filter(Boolean)
            .slice(0, 6)
            .map((p: any) => ({
              place_id: p.placeId,
              description: p.text?.toString?.() || p.text?.text || "",
              _prediction: p,
            }))
            .filter((p: any) => p.description);
          // If the new API is not enabled for this key it can return nothing;
          // fall back to the legacy service so members still get suggestions.
          if (mapped.length === 0) {
            legacy();
            return;
          }
          setPredictions(mapped);
          setHighlight(0);
        } catch {
          if (requestId === requestIdRef.current) legacy();
        }
        return;
      }

      legacy();

    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [types.join(",")]
  );

  // Run any input typed before Google finished loading.
  useEffect(() => {
    if (ready && pendingInputRef.current) {
      fetchPredictions(pendingInputRef.current);
      pendingInputRef.current = null;
    }
  }, [ready, fetchPredictions]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    setOpen(true);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (v.trim().length < 3) {
      setPredictions([]);
      return;
    }
    if (!ready) {
      pendingInputRef.current = v;
      return;
    }
    debounceRef.current = window.setTimeout(() => fetchPredictions(v), 250);
  };


  const parseComponents = (components: any[] | undefined) => {
    let city = "";
    let country = "";
    components?.forEach((c: any) => {
      const typesList: string[] = c.types || [];
      const name = c.long_name ?? c.longText ?? "";
      if (typesList.includes("locality")) city = city || name;
      if (typesList.includes("postal_town")) city = city || name;
      if (typesList.includes("administrative_area_level_1")) city = city || name;
      if (typesList.includes("country")) country = country || name;
    });
    return { city, country };
  };

  const handleSelect = async (prediction: any) => {
    setOpen(false);
    setPredictions([]);
    const g = (window as any).google?.maps?.places;

    // New Places API path
    if (prediction?._prediction?.toPlace) {
      try {
        const place = prediction._prediction.toPlace();
        await place.fetchFields({
          fields: ["addressComponents", "formattedAddress", "location", "displayName"],
        });
        if (g?.AutocompleteSessionToken) sessionTokenRef.current = new g.AutocompleteSessionToken();
        const { city, country } = parseComponents(place.addressComponents);
        onSelect({
          description: prediction.description,
          city,
          country,
          formattedAddress: place.formattedAddress || prediction.description,
          latitude: place.location?.lat?.(),
          longitude: place.location?.lng?.(),
        });
      } catch {
        onChange(prediction.description);
      }
      return;
    }

    if (!placesServiceRef.current) {
      onChange(prediction.description);
      return;
    }
    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ["address_components", "formatted_address", "geometry", "name"],
        sessionToken: sessionTokenRef.current,
      },
      (place: any, status: string) => {
        if (g) sessionTokenRef.current = new g.AutocompleteSessionToken();
        if (status !== "OK" || !place) {
          onChange(prediction.description);
          return;
        }
        const { city, country } = parseComponents(place.address_components);
        onSelect({
          description: prediction.description,
          city,
          country,
          formattedAddress: place.formatted_address || prediction.description,
          latitude: place.geometry?.location?.lat?.(),
          longitude: place.geometry?.location?.lng?.(),
        });
      }
    );
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
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(showIcon && "pl-10", className)}
      />
      {open && predictions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md overflow-hidden">
          {predictions.map((p, i) => (
            <li
              key={p.place_id}
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
