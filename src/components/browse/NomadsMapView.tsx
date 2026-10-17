import { lazy, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import type { SitterWithProfile } from "@/hooks/useSitters";
import LocationSearchInput from "@/components/search/LocationSearchInput";
import { NomadFilterTags, NomadFiltersButton, type NomadFilterState } from "@/components/browse/NomadFilters";
import NomadMapCard from "@/components/maps/NomadMapCard";
import { MapScreen } from "@/components/maps/MapScreen";
import MembersOnlyNotice from "@/components/nn/MembersOnlyNotice";
import { nnButton } from "@/components/nn/ui";
import { cn } from "@/lib/utils";

const SitterGoogleMap = lazy(() => import("@/components/maps/SitterGoogleMap"));

/**
 * Browse Nomads, map view (design: NomadsMapPhone, NomadsMapDesktop and their
 * dark versions). Pins sit on the city each Nomad chose (stored rounded to
 * about 1 km), never a home; first names only.
 */
const NomadsMapView = ({
  user,
  membersOnly,
  sitters,
  loading,
  error,
  refetch,
  search,
  onSearch,
  filters,
  onFiltersChange,
  onOpenFilters,
  onClearAll,
  onShowList,
}: {
  user: User | null;
  /** Signed out, or the sign-in ended: today's members-only notice. */
  membersOnly: boolean;
  sitters: SitterWithProfile[];
  loading: boolean;
  error: unknown;
  refetch: () => void;
  search: string;
  onSearch: (v: string) => void;
  filters: NomadFilterState;
  onFiltersChange: (f: NomadFilterState) => void;
  onOpenFilters: () => void;
  onClearAll: () => void;
  onShowList: () => void;
}) => {
  const onMap = useMemo(() => sitters.filter((s) => s.latitude && s.longitude), [sitters]);
  const filtered = !!search || filters.petTypes.length + filters.experienceLevels.length + filters.languages.length > 0;

  // Today's wording and buttons, in a floating card.
  const message = membersOnly ? (
    <MembersOnlyNotice headingLevel="h2" />
  ) : error ? (
    <div role="alert" className="flex flex-col items-center gap-3 text-center">
      <p className="text-[17px] font-bold">We couldn't load Nomads</p>
      <p className="text-[15px] text-muted-foreground">Check your connection and try again.</p>
      <button type="button" onClick={() => refetch()} className={nnButton("primary")}>
        Try again
      </button>
    </div>
  ) : !loading && sitters.length === 0 ? (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-[17px] font-bold">{filtered ? "No Nomads match" : "No Nomads here yet"}</p>
      <p className="text-[15px] text-muted-foreground">{filtered ? "Try fewer filters." : "Be the first to create a Nomad profile!"}</p>
      {filtered && (
        <button type="button" onClick={onClearAll} className={nnButton("secondary")}>
          Clear filters
        </button>
      )}
    </div>
  ) : !loading && onMap.length === 0 ? (
    <p className="text-center text-[15px] text-muted-foreground">No Nomads with location data yet.</p>
  ) : null;

  return (
    <MapScreen
      user={user}
      items={membersOnly ? [] : onMap}
      getId={(s) => s.user_id}
      isLoading={loading && !membersOnly}
      message={message}
      countLabel={`${onMap.length} ${onMap.length === 1 ? "Nomad" : "Nomads"}`}
      loadingLabel="Finding Nomads…"
      note="Pins show the city a Nomad chose, never a home."
      title="Browse Nomads"
      subtitle="Trusted Nomads ready to look after your home and pets."
      srTitle="Browse Nomads, map"
      search={(where) => (
        <LocationSearchInput
          wrapperClassName={where === "float" ? "min-w-0 flex-1" : "w-full"}
          className={cn("rounded-full text-[15px]", where === "float" && "border-border bg-card shadow-float")}
          placeholder="Search a city or name"
          value={search}
          onChange={onSearch}
        />
      )}
      filters={(where) => (
        <>
          <NomadFiltersButton filters={filters} onOpenFilters={onOpenFilters} floating={where === "float"} />
          <NomadFilterTags filters={filters} onChange={onFiltersChange} floating={where === "float"} />
        </>
      )}
      onShowList={onShowList}
      renderMap={(m) => <SitterGoogleMap sitters={membersOnly ? [] : onMap} selectedId={m.selectedId} onPick={m.onPick} padding={m.padding} focus={m.focus} />}
      renderCard={(s, c) => <NomadMapCard sitter={s} selected={c.selected} onPick={c.onPick} />}
      cardWidth="w-[300px] md:w-[330px]"
    />
  );
};

export default NomadsMapView;
