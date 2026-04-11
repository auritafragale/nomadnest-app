import { useRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { APIProvider } from "@vis.gl/react-google-maps";

interface PlaceResult {
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface PlacesAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (result: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  types?: string[];
}

const AutocompleteInner = ({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Search location...",
  className,
  types = ["(cities)"],
}: PlacesAutocompleteInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!inputRef.current || initialized || !(window as any).google?.maps?.places) return;

    const gm = (window as any).google.maps;
    autocompleteRef.current = new gm.places.Autocomplete(inputRef.current, {
      types,
      fields: ["geometry", "address_components", "formatted_address", "name"],
    });

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current?.getPlace();
      if (!place?.geometry?.location) return;

      let city = "";
      let country = "";
      place.address_components?.forEach((comp: any) => {
        if (comp.types.includes("locality")) city = comp.long_name;
        if (comp.types.includes("administrative_area_level_1") && !city) city = comp.long_name;
        if (comp.types.includes("country")) country = comp.long_name;
      });

      const address = place.formatted_address || place.name || "";
      onChange(types.includes("(cities)") ? [city, country].filter(Boolean).join(", ") : address);
      onPlaceSelect({
        address,
        city,
        country,
        latitude: place.geometry.location.lat(),
        longitude: place.geometry.location.lng(),
      });
    });

    setInitialized(true);
  }, [initialized, types, onChange, onPlaceSelect]);

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`pl-10 ${className || ""}`}
      />
    </div>
  );
};

const PlacesAutocompleteInput = (props: PlacesAutocompleteInputProps) => {
  const { data: apiKey, isLoading } = useGoogleMapsKey();

  if (isLoading || !apiKey) {
    return (
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder || "Search location..."}
          className={`pl-10 ${props.className || ""}`}
        />
      </div>
    );
  }

  return (
    <APIProvider apiKey={config.key} libraries={["places"]}>
      <AutocompleteInner {...props} />
    </APIProvider>
  );
};

export default PlacesAutocompleteInput;
