import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import ImageUpload from "@/components/listing/ImageUpload";
import PlacesAutocompleteField from "@/components/maps/PlacesAutocompleteField";
import type { ListingFormData } from "@/hooks/useListingForm";
import { useGoogleMapsKey } from "@/hooks/useGoogleMapsKey";
import { geocodeCityCountry } from "@/lib/geocode";
import { AMENITIES, HOME_TYPES, PRACTICAL, SETTINGS, SLEEPING, WIFI } from "@/lib/listingOptions";
import { AI_SUGGESTION_NOTE, petContext, useWritingHelper } from "@/hooks/useWritingHelper";
import { useToast } from "@/hooks/use-toast";
import { AiButton, FieldError, FieldLabel, PillGroup, PrivateTag, SelectField, StepTitle, TileGroup, ToggleRow, inputClass } from "./FormBits";
import { cn } from "@/lib/utils";

/** Home: type, setting, where it is, the practical bits, photos and a note. */
const HomeStep = ({
  formData,
  updateFormData,
  onPhotoRemoved,
  errors,
}: {
  formData: ListingFormData;
  updateFormData: (d: Partial<ListingFormData>) => void;
  onPhotoRemoved: (url: string) => void;
  errors: Record<string, string>;
}) => {
  const { toast } = useToast();
  const ai = useWritingHelper();
  const { data: mapsConfig } = useGoogleMapsKey();
  const [allAmenities, setAllAmenities] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const savedLocation = [formData.city, formData.country].filter(Boolean).join(", ");

  // Keep the visible text in step when an existing listing loads.
  useEffect(() => {
    if (savedLocation && !formData.locationQuery) updateFormData({ locationQuery: savedLocation });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLocation]);

  // A typed but not picked place is looked up with Google, so typing "Dubai"
  // never traps anyone.
  const resolveLocation = useCallback(async () => {
    setLocationError(null);
    const typed = (formData.locationQuery || "").trim();
    if (!typed) return;
    if (formData.city && savedLocation.toLowerCase() === typed.toLowerCase()) return;
    if (!mapsConfig?.key) {
      setLocationError("We couldn't check that place. Try 'Lisbon, Portugal'.");
      return;
    }
    setResolving(true);
    try {
      const coords = await geocodeCityCountry(mapsConfig.key, typed);
      if (!coords) {
        setLocationError("We couldn't find that place. Try 'Lisbon, Portugal'.");
        return;
      }
      const parts = typed.split(",").map((s) => s.trim()).filter(Boolean);
      updateFormData({
        city: parts.length > 1 ? parts[0] : typed,
        country: parts.length > 1 ? parts.slice(1).join(", ") : formData.country || "",
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } finally {
      setResolving(false);
    }
  }, [formData.locationQuery, formData.city, formData.country, savedLocation, mapsConfig?.key, updateFormData]);

  const polish = async () => {
    try {
      const suggestion = await ai.suggest.mutateAsync({
        kind: "listing_description",
        text: formData.description,
        context: { city: formData.city, home_type: formData.home_type, pets: petContext(formData.pets) },
      });
      updateFormData({ description: suggestion, descriptionAi: true });
    } catch (e) {
      toast({ title: "Couldn't polish the text", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    }
  };

  const amenities = allAmenities ? AMENITIES : AMENITIES.slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <StepTitle>Your home</StepTitle>

      <div className="flex flex-col gap-1">
        <TileGroup label="Type of home" options={HOME_TYPES} value={formData.home_type} onChange={(v) => updateFormData({ home_type: v })} required />
        {errors.home_type && <FieldError id="home-type-err">{errors.home_type}</FieldError>}
      </div>
      <TileGroup label="Setting" options={SETTINGS} value={formData.location_type} onChange={(v) => updateFormData({ location_type: v })} />

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="listing-location">Where is it?</FieldLabel>
        <PlacesAutocompleteField
          id="listing-location"
          value={formData.locationQuery}
          onChange={(v) => {
            setLocationError(null);
            // Typing replaces the picked place, so stale coordinates never stay behind.
            updateFormData(
              formData.city || formData.country || formData.latitude || formData.longitude
                ? { locationQuery: v, city: "", country: "", latitude: null, longitude: null }
                : { locationQuery: v },
            );
          }}
          onSelect={(place) => {
            updateFormData({
              locationQuery: place.description,
              city: place.city,
              country: place.country,
              latitude: place.latitude,
              longitude: place.longitude,
            });
            setLocationError(null);
          }}
          onBlur={resolveLocation}
          placeholder="Search for your town or city"
          types={["(cities)"]}
        />
        {resolving && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Looking up that place…
          </p>
        )}
        {(locationError || errors.location) && <FieldError id="location-err">{locationError || errors.location}</FieldError>}
        {formData.city && !locationError && <p className="text-[15px] font-semibold">📍 {savedLocation}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="listing-area">Area, shown to everyone</FieldLabel>
        <input id="listing-area" value={formData.area} onChange={(e) => updateFormData({ area: e.target.value })} placeholder="e.g. Alfama, near the river" className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="listing-address" extra={<PrivateTag />}>
          Full address
        </FieldLabel>
        <PlacesAutocompleteField
          id="listing-address"
          value={formData.address_private}
          onChange={(v) => updateFormData({ address_private: v })}
          onSelect={(place) =>
            updateFormData({
              address_private: place.formattedAddress || place.description,
              latitude: place.latitude,
              longitude: place.longitude,
              city: place.city || formData.city,
              country: place.country || formData.country,
            })
          }
          placeholder="Street, number and postcode"
          types={["address"]}
        />
        <p className="text-sm text-muted-foreground">
          Only your confirmed Nomad sees it, 48 hours before the sit. Maps show a 500m area, never the home.
        </p>
      </div>

      <TileGroup
        label="Reachable by public transport"
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]}
        value={formData.public_transport_accessible === null ? "" : formData.public_transport_accessible ? "yes" : "no"}
        onChange={(v) => updateFormData({ public_transport_accessible: v === "yes" })}
        columns="grid-cols-2"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="listing-wifi">Wi-Fi</FieldLabel>
          <SelectField id="listing-wifi" value={formData.wifi_quality} onChange={(v) => updateFormData({ wifi_quality: v })} options={WIFI} placeholder="Choose one" />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="listing-sleep">Where they sleep</FieldLabel>
          <SelectField id="listing-sleep" value={formData.sleeping_arrangement} onChange={(v) => updateFormData({ sleeping_arrangement: v })} options={SLEEPING} placeholder="Choose one" />
        </div>
      </div>

      <div id="amenities" className="flex flex-col gap-2">
        <PillGroup label="Amenities" options={amenities} values={formData.amenities} onChange={(v) => updateFormData({ amenities: v })} />
        <button
          type="button"
          aria-expanded={allAmenities}
          aria-controls="amenities"
          onClick={() => setAllAmenities(!allAmenities)}
          className="min-h-11 self-start text-[15px] font-bold underline underline-offset-2"
        >
          {allAmenities ? "Show fewer" : `Show all ${AMENITIES.length}`}
        </button>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[15px] font-bold">Good to know</legend>
        {PRACTICAL.map((p) => (
          <ToggleRow key={p.key} id={`practical-${p.key}`} label={p.label} sub={p.sub} checked={!!formData[p.key]} onChange={(v) => updateFormData({ [p.key]: v })} />
        ))}
      </fieldset>

      <ImageUpload
        images={formData.photos}
        onImagesChange={(photos) => updateFormData({ photos })}
        onRemove={onPhotoRemoved}
        maxImages={8}
        folder="home"
        label="Photos of your home (up to 8)"
        sortable
      />

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="listing-description" extra={ai.visible && <AiButton label="Polish with AI" busy={ai.suggest.isPending} onClick={polish} disabled={!formData.description.trim()} />}>
          Anything else a Nomad should know?
        </FieldLabel>
        <textarea
          id="listing-description"
          value={formData.description}
          onChange={(e) => updateFormData({ description: e.target.value, descriptionAi: false })}
          rows={6}
          placeholder="What makes your home and your pets special, and anything a Nomad should know before saying yes."
          aria-describedby={formData.descriptionAi ? "description-ai" : undefined}
          className={cn(inputClass, "resize-y")}
        />
        {formData.descriptionAi && (
          <p id="description-ai" className="text-sm text-muted-foreground">
            {AI_SUGGESTION_NOTE}
          </p>
        )}
      </div>
    </div>
  );
};

export default HomeStep;
