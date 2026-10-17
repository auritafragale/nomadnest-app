import { useMemo } from "react";
import type { SitterWithProfile } from "@/hooks/useSitters";
import GoogleMapsProvider, { useGoogleMapsConfig } from "./GoogleMapsProvider";
import { ClusteredPins, FitAndFocus, WorldMap } from "./WorldMap";
import type { MapFocus, MapPadding } from "./mapLimits";
import { cn } from "@/lib/utils";

// A Nomad's pin sits on the city they chose (stored rounded to ~1 km, never
// an address). The picked Nomad's pin grows and gets a coral ring.
const NomadPin = ({ sitter, on }: { sitter: SitterWithProfile; on: boolean }) => {
  const first = (sitter.profile?.first_name || "").trim();
  return (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-full border-[3px] bg-[#D8C3B0] font-bold text-[#5A4636] shadow-float",
        on ? "h-[58px] w-[58px] border-brand-coral text-[17px]" : "h-12 w-12 border-[var(--nn-logo-bg)] text-[16px]",
      )}
    >
      {sitter.profile?.avatar_url ? <img src={sitter.profile.avatar_url} alt="" className="h-full w-full object-cover" /> : (first[0] ?? "?").toUpperCase()}
    </span>
  );
};

interface SitterGoogleMapProps {
  /** Nomads with a city point (latitude and longitude set). */
  sitters: SitterWithProfile[];
  selectedId: string | null;
  /** A pin ([user id]) or a cluster (its user ids) was tapped. */
  onPick: (ids: string[]) => void;
  padding: MapPadding;
  focus: MapFocus | null;
}

const MapContent = ({ sitters, selectedId, onPick, padding, focus }: SitterGoogleMapProps) => {
  const { nomadMapId } = useGoogleMapsConfig();
  const points = useMemo(() => sitters.map((s) => ({ id: s.user_id, lat: s.latitude!, lng: s.longitude! })), [sitters]);
  const byId = useMemo(() => new Map(sitters.map((s) => [s.user_id, s])), [sitters]);
  return (
    <WorldMap mapId={nomadMapId || "nomad-map"} label="Map of Nomads">
      <FitAndFocus points={points} padding={padding} focus={focus} maxFitZoom={10} />
      <ClusteredPins
        points={points}
        selectedId={selectedId}
        onPick={onPick}
        renderPin={(id, on) => <NomadPin sitter={byId.get(id)!} on={on} />}
        titleOf={(id) => `${byId.get(id)?.profile?.first_name || "Nomad"}, ${byId.get(id)?.profile?.city || "their city"}`}
      />
    </WorldMap>
  );
};

/** Browse Nomads map: one pin per Nomad on their chosen city, clustered, filling its container. */
const SitterGoogleMap = (props: SitterGoogleMapProps) => (
  <GoogleMapsProvider height="100%">
    <MapContent {...props} />
  </GoogleMapsProvider>
);

export default SitterGoogleMap;
