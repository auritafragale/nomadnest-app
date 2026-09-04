import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ListingFormData } from "@/hooks/useListingForm";
import { cn } from "@/lib/utils";
import { geocodeCityCountry } from "@/lib/geocode";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import {
  Home, Building2, Building, TreePine,
  Wifi, WifiOff, Bed, Sofa, MapPin, Loader2, Navigation
} from "lucide-react";
import ImageUpload from "@/components/listing/ImageUpload";
import PlacesAutocompleteField from "@/components/maps/PlacesAutocompleteField";

interface HomeInfoStepProps {
  formData: ListingFormData;
  updateFormData: (data: Partial<ListingFormData>) => void;
}

const homeTypes = [
  { value: "apartment", label: "Apartment", icon: Building2 },
  { value: "house", label: "House", icon: Home },
  { value: "condo", label: "Condo", icon: Building },
  { value: "cottage", label: "Cottage / Rural", icon: TreePine },
];

const wifiOptions = [
  { value: "excellent", label: "Excellent (Fiber/high-speed)", icon: Wifi },
  { value: "good", label: "Good (works for video calls)", icon: Wifi },
  { value: "basic", label: "Basic (browsing only)", icon: WifiOff },
  { value: "none", label: "No WiFi", icon: WifiOff },
];

const sleepingOptions = [
  { value: "private_room", label: "Private room", icon: Bed },
  { value: "private_bathroom", label: "Private room with bathroom", icon: Bed },
  { value: "shared_space", label: "Shared space", icon: Sofa },
  { value: "entire_place", label: "Entire place to yourself", icon: Home },
];

const amenitiesList = [
  "Washer/Dryer",
  "Dishwasher",
  "Air Conditioning",
  "Heating",
  "TV/Streaming",
  "Garden/Yard",
  "Balcony/Terrace",
  "Parking",
  "Gym Access",
  "Pool",
  "Workspace/Desk",
  "Coffee Machine",
  "BBQ/Grill",
  "Bike Available",
  "Car Available",
];

const HomeInfoStep = ({ formData, updateFormData }: HomeInfoStepProps) => {
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const { data: mapsConfig } = useGoogleMapsKey();
  const savedLocation = [formData.city, formData.country].filter(Boolean).join(", ");
  const [locationQuery, setLocationQuery] = useState(savedLocation);

  // Keep the visible text in sync when the city is filled in elsewhere
  // (geolocation, editing an existing listing).
  useEffect(() => {
    if (savedLocation && !locationQuery) setLocationQuery(savedLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLocation]);

  const toggleAmenity = (amenity: string) => {
    const current = formData.amenities;
    const updated = current.includes(amenity)
      ? current.filter((a) => a !== amenity)
      : [...current, amenity];
    updateFormData({ amenities: updated });
  };

  // Resolve a typed-but-not-selected location string into city/country/coords
  // via Google Geocoding, so a member who just types "Dubai" is never trapped.
  const resolveLocation = useCallback(async () => {
    setLocationError(null);
    const typed = locationQuery.trim();
    // Already resolved (city matches the text) — nothing to do.
    if (!typed) return;
    const alreadyResolved = formData.city && savedLocation.toLowerCase() === typed.toLowerCase();
    if (alreadyResolved) return;
    if (!mapsConfig?.key) {
      setLocationError("We couldn't verify that place — try 'Dubai, United Arab Emirates'.");
      return;
    }
    setResolving(true);
    try {
      const coords = await geocodeCityCountry(mapsConfig.key, typed);
      if (!coords) {
        setLocationError("We couldn't find that place — try 'Dubai, United Arab Emirates'.");
        return;
      }
      // Reverse the typed string into city/country by geocoding again with
      // the resolved coords would need a second call; instead parse the typed
      // text as "City, Country" when possible, or set it as city wholesale.
      const parts = typed.split(",").map((s) => s.trim()).filter(Boolean);
      const city = parts.length > 1 ? parts[0] : typed;
      const country = parts.length > 1 ? parts.slice(1).join(", ") : "";
      updateFormData({
        city,
        country: country || formData.country || "",
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } finally {
      setResolving(false);
    }
  }, [locationQuery, formData.city, formData.country, savedLocation, mapsConfig?.key, updateFormData]);

  // Expose resolveLocation so the parent (CreateListing/EditListing) can call
  // it before validating/submitting. Stored on a ref-like window prop is hacky;
  // instead we attach it to formData via a custom event the parent can trigger.
  // Simpler: we resolve on blur here, and also re-resolve in the parent submit.
  useEffect(() => {
    (window as any).__nomadnestResolveLocation = resolveLocation;
    return () => {
      if ((window as any).__nomadnestResolveLocation === resolveLocation) {
        delete (window as any).__nomadnestResolveLocation;
      }
    };
  }, [resolveLocation]);

  const handleGeolocate = () => {
    if (!navigator.geolocation) return;
    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateFormData({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setIsGeolocating(false);
      },
      () => setIsGeolocating(false),
      { enableHighAccuracy: true }
    );
  };

  const geocodeFromCity = async () => {
    const query = [formData.city, formData.country].filter(Boolean).join(", ");
    if (!query) return;
    setIsGeolocating(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
      const results = await res.json();
      if (results?.[0]) {
        updateFormData({
          latitude: parseFloat(results[0].lat),
          longitude: parseFloat(results[0].lon),
        });
      }
    } catch (e) {
      console.warn("Geocoding failed");
    } finally {
      setIsGeolocating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground">
          About your home
        </h2>
        <p className="text-muted-foreground mt-2">
          Help nomads understand your living space
        </p>
      </div>

      <div className="space-y-6">
        {/* Home Type */}
        <div className="space-y-2">
          <Label>Home Type *</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {homeTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => updateFormData({ home_type: type.value })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border transition-all",
                    formData.home_type === type.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-sm font-medium">{type.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Location with Places Autocomplete */}
        <div className="space-y-2">
          <Label>Location *</Label>
          <PlacesAutocompleteField
            value={locationQuery}
            onChange={(v) => {
              setLocationQuery(v);
              setLocationError(null);
              // Typing invalidates the previously picked place so stale
              // city/country/coordinates can never linger behind new text.
              if (formData.city || formData.country || formData.latitude || formData.longitude) {
                updateFormData({ city: "", country: "", latitude: null, longitude: null });
              }
            }}
            onSelect={(place) => {
              setLocationQuery(place.description);
              setLocationError(null);
              updateFormData({
                city: place.city,
                country: place.country,
                latitude: place.latitude,
                longitude: place.longitude,
              });
            }}
            onBlur={resolveLocation}
            placeholder="Search for your city..."
            types={["(cities)"]}
          />

          {resolving && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Looking up that place…
            </p>
          )}
          {locationError && (
            <p className="text-xs text-destructive">{locationError}</p>
          )}
          {formData.city && !locationError && (
            <p className="text-xs text-muted-foreground">
              📍 {[formData.city, formData.country].filter(Boolean).join(", ")}
              {formData.latitude && formData.longitude && ` (${formData.latitude.toFixed(4)}, ${formData.longitude.toFixed(4)})`}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="area">Neighborhood / Area</Label>
          <Input
            id="area"
            placeholder="e.g., Gothic Quarter, near the beach"
            value={formData.area}
            onChange={(e) => updateFormData({ area: e.target.value })}
          />
        </div>

        {/* Private Address with Places Autocomplete */}
        <div className="space-y-2">
          <Label>Full Address (private — only shared with confirmed nomads)</Label>
          <PlacesAutocompleteField
            value={formData.address_private}
            onChange={(v) => updateFormData({ address_private: v })}
            onSelect={(place) => {
              updateFormData({
                address_private: place.formattedAddress || place.description,
                latitude: place.latitude,
                longitude: place.longitude,
                city: place.city || formData.city,
                country: place.country || formData.country,
              });
            }}
            placeholder="e.g., Carrer de Mallorca 401, 08013 Barcelona"
            types={["address"]}
          />
        </div>

        <div className="space-y-2">
          <Label>WiFi Quality</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {wifiOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateFormData({ wifi_quality: option.value })}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all text-center",
                    formData.wifi_quality === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sleeping Arrangement */}
        <div className="space-y-2">
          <Label>Sleeping Arrangement</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sleepingOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateFormData({ sleeping_arrangement: option.value })}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-lg border transition-all",
                    formData.sleeping_arrangement === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Amenities */}
        <div className="space-y-3">
          <Label>Amenities</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {amenitiesList.map((amenity) => (
              <div
                key={amenity}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                  formData.amenities.includes(amenity)
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => toggleAmenity(amenity)}
              >
                <Checkbox
                  checked={formData.amenities.includes(amenity)}
                  onCheckedChange={() => toggleAmenity(amenity)}
                />
                <span className="text-sm">{amenity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Home Photos */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Home Photos</Label>
          <p className="text-sm text-muted-foreground">
            Add photos of your home to attract nomads
          </p>
          <ImageUpload
            images={formData.photos}
            onImagesChange={(photos) => updateFormData({ photos })}
            maxImages={8}
            folder="home"
            label="Home Photos"
          />
        </div>
      </div>
    </div>
  );
};

export default HomeInfoStep;
