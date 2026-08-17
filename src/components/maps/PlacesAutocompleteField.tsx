import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const serviceRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  // Init Google services once available
  useEffect(() => {
    const init = () => {
      const g = (window as any).google?.maps?.places;
      if (!g) return false;
      if (g.AutocompleteSessionToken) sessionTokenRef.current = new g.AutocompleteSessionToken();
      if (!g.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
        // Legacy services
        serviceRef.current = new g.AutocompleteService();
        const node = document.createElement("div");
        placesServiceRef.current = new g.PlacesService(node);
      }
      return true;
    };
    if (init()) return;
    const interval = window.setInterval(() => {
      if (init()) window.clearInterval(interval);
    }, 200);
    return () => window.clearInterval(interval);
  }, []);

  const fetchPredictions = useCallback(
    async (input: string) => {
      const g = (window as any).google?.maps?.places;
      if (!g || !input.trim()) {
        setPredictions([]);
        return;
      }

      if (g.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
        try {
          const includedPrimaryTypes = types.flatMap((t) =>
            t === "(cities)"
              ? ["locality", "administrative_area_level_3"]
              : t === "(regions)"
                ? ["locality", "administrative_area_level_1", "postal_code"]
                : t === "address"
                  ? ["street_address", "premise", "route"]
                  : [t]
          );
          const { suggestions } = await g.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            includedPrimaryTypes,
            sessionToken: sessionTokenRef.current ?? undefined,
          });
          setPredictions(
            (suggestions || [])
              .map((s: any) => s.placePrediction)
              .filter(Boolean)
              .map((p: any) => ({
                place_id: p.placeId,
                description: p.text?.toString?.() || p.text?.text || "",
                _prediction: p,
              }))
              .filter((p: any) => p.description)
          );
          setHighlight(0);
        } catch {
          setPredictions([]);
        }
        return;
      }

      if (!serviceRef.current) {
        setPredictions([]);
        return;
      }
      serviceRef.current.getPlacePredictions(
        { input, types, sessionToken: sessionTokenRef.current },
        (results: any[] | null) => {
          setPredictions(results || []);
          setHighlight(0);
        }
      );
    },
    [types]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    setOpen(true);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
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
