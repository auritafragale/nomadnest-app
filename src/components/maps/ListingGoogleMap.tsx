import { useMemo } from "react";
import { ListingWithDetails } from "@/hooks/useListings";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import { ClusteredPins, FitAndFocus, WorldMap } from "./WorldMap";
import type { MapFocus, MapPadding } from "./mapLimits";
import { cn } from "@/lib/utils";

// A sit is a soft area circle, never a pin: listing coordinates are an
// approximate area (a stored random point within ~500 m), so nothing points
// at a house. The picked sit's circle turns coral.
const SitCircle = ({ on }: { on: boolean }) => (
  <div className="relative flex h-16 w-16 items-center justify-center">
    <span className={cn("absolute inset-0 rounded-full border-2", on ? "border-brand-coral bg-brand-coral/25" : "border-brand-teal bg-brand-teal/20")} />
    <span
      className={cn(
        "relative h-3 w-3 rounded-full border-[2.5px] border-[var(--nn-logo-bg)] shadow-float",
        on ? "bg-brand-coral" : "bg-brand-teal",
      )}
    />
  </div>
);

interface ListingGoogleMapProps {
  /** Sits with an area to show (latitude and longitude set). */
  listings: ListingWithDetails[];
  selectedId: string | null;
  /** A circle ([id]) or a cluster (its ids) was tapped. */
  onPick: (ids: string[]) => void;
  padding: MapPadding;
  focus: MapFocus | null;
}

const MapContent = ({ listings, selectedId, onPick, padding, focus }: ListingGoogleMapProps) => {
  const { listingMapId } = useGoogleMapsConfig();
  const points = useMemo(() => listings.map((l) => ({ id: l.id, lat: l.latitude!, lng: l.longitude! })), [listings]);
  const titles = useMemo(() => new Map(listings.map((l) => [l.id, `Sit area: ${l.title}`])), [listings]);
  return (
    <WorldMap mapId={listingMapId || "listing-map"} label="Map of sits">
      <FitAndFocus points={points} padding={padding} focus={focus} maxFitZoom={12} />
      <ClusteredPins
        points={points}
        selectedId={selectedId}
        onPick={onPick}
        renderPin={(_id, on) => <SitCircle on={on} />}
        titleOf={(id) => titles.get(id) ?? "Sit area"}
      />
    </WorldMap>
  );
};

/** Browse Sits map: soft area circles, clustered, filling its container. */
const ListingGoogleMap = (props: ListingGoogleMapProps) => (
  <GoogleMapsProvider height="100%">
    <MapContent {...props} />
  </GoogleMapsProvider>
);

export default ListingGoogleMap;
