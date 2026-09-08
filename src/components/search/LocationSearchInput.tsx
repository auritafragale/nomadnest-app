import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCityPredictions, type CityPrediction } from "@/hooks/useCityPredictions";

interface LocationSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
}

/**
 * Search input that suggests locations (cities) while typing.
 * Free text still works — suggestions are optional.
 */
const LocationSearchInput = ({
  value,
  onChange,
  placeholder,
  className,
  wrapperClassName,
}: LocationSearchInputProps) => {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { predictions, clear } = useCityPredictions(value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [predictions]);

  // Address-component type names Google uses for "the city", in priority
  // order — some countries (e.g. Japan, parts of the UK) don't populate
  // "locality" at all, so we fall back down the list.
  const CITY_COMPONENT_TYPES = ["locality", "postal_town", "administrative_area_level_2"];

  const extractCityName = (components: any[] | undefined | null): string | null => {
    for (const type of CITY_COMPONENT_TYPES) {
      const match = components?.find((c: any) => c.types?.includes(type));
      const name = match?.longText || match?.long_name;
      if (name) return name;
    }
    return null;
  };

  const select = async (prediction: CityPrediction) => {
    clear();
    setOpen(false);

    // Parsed prediction text (mainText) is unreliable across countries —
    // e.g. Australian localities bake the state code into the primary name
    // ("Adelaide SA"). Fetch the place's structured address components
    // instead and pull the clean city name out of those, with no
    // state/region text mixed in regardless of country.
    try {
      const g = (window as any).google?.maps?.places;
      if (!g?.Place) throw new Error("google.maps.places.Place unavailable");
      const place = new g.Place({ id: prediction.place_id });
      await place.fetchFields({ fields: ["addressComponents"] });
      const cityName = extractCityName(place.addressComponents);
      onChange(cityName || prediction.mainText);
    } catch (err) {
      console.error("Failed to fetch place address components, falling back to mainText:", err);
      onChange(prediction.mainText);
    }
  };

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
      select(predictions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", wrapperClassName)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
      <Input
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={cn("pl-10 h-12", className)}
      />
      {open && predictions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md overflow-hidden">
          {predictions.map((p, i) => (
            <li
              key={p.place_id}
              onMouseDown={(e) => {
                e.preventDefault();
                select(p);
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

export default LocationSearchInput;
