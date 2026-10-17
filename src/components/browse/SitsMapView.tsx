import { lazy, useMemo } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { ListingFilters, ListingWithDetails } from "@/hooks/useListings";
import LocationSearchInput from "@/components/search/LocationSearchInput";
import { SitFilterTags, SitFiltersButton, clearFilters } from "@/components/browse/SitFilters";
import SitMapCard from "@/components/maps/SitMapCard";
import { FLOAT, MapScreen } from "@/components/maps/MapScreen";
import { nnButton } from "@/components/nn/ui";
import { cn } from "@/lib/utils";

const ListingGoogleMap = lazy(() => import("@/components/maps/ListingGoogleMap"));

/**
 * Browse Sits, map view (design: SitsMapPhone, SitsMapTabletDark,
 * SitsMapDesktop and their dark versions). Sits show as soft area circles,
 * never a home.
 */
const SitsMapView = ({
  user,
  listings,
  isLoading,
  error,
  refetch,
  filters,
  onFiltersChange,
  onOpenFilters,
  onShowList,
  onSignUpPrompt,
  hasActiveFilters,
}: {
  user: User | null;
  listings: ListingWithDetails[] | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  filters: ListingFilters;
  onFiltersChange: (f: ListingFilters) => void;
  onOpenFilters: () => void;
  onShowList: () => void;
  onSignUpPrompt: () => void;
  hasActiveFilters: boolean;
}) => {
  const all = useMemo(() => listings ?? [], [listings]);
  const onMap = useMemo(() => all.filter((l) => l.latitude && l.longitude), [all]);
  const empty = !isLoading && !error && all.length === 0;

  // Today's wording and buttons for no sits, none for these filters, or an error.
  const message = error ? (
    <div role="alert" className="flex flex-col items-center gap-3 text-center">
      <p className="text-[16px] font-bold">We couldn't load sits</p>
      <p className="text-[15px] text-muted-foreground">Check your connection and try again.</p>
      <button type="button" onClick={() => refetch()} className={nnButton("primary")}>
        Try again
      </button>
    </div>
  ) : empty && hasActiveFilters ? (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-[17px] font-bold">No sits match your filters</p>
      <p className="text-[15px] text-muted-foreground">Try different dates or fewer filters.</p>
      <button type="button" onClick={() => onFiltersChange(clearFilters(filters))} className={nnButton("secondary")}>
        Clear filters
      </button>
    </div>
  ) : empty ? (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-[17px] font-bold">No sits posted right now</p>
      <p className="text-[15px] text-muted-foreground">
        NomadNest is young and new homes are added every week. Finish your Nomad profile so Pet Parents can invite you directly.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to={user ? "/edit-sitter-profile" : "/auth?signup=true&role=sitter"} className={nnButton("primary")}>
          Finish my profile
        </Link>
        <Link to="/find-nomads" className={nnButton("secondary")}>
          Find Nomads near me
        </Link>
      </div>
    </div>
  ) : !isLoading && onMap.length === 0 ? (
    <p className="text-center text-[15px] text-muted-foreground">No listings have location data yet.</p>
  ) : null;

  return (
    <MapScreen
      user={user}
      items={onMap}
      getId={(l) => l.id}
      isLoading={isLoading}
      message={message}
      countLabel={`${onMap.length} ${onMap.length === 1 ? "sit" : "sits"} in this area`}
      loadingLabel="Finding sits…"
      note="Circles show the area, never the home."
      title="Browse Sits"
      subtitle="Homes and pets looking for a Nomad."
      srTitle="Browse Sits, map"
      search={(where) => (
        <LocationSearchInput
          wrapperClassName={where === "float" ? "min-w-0 flex-1" : "w-full"}
          className={cn("rounded-full text-[15px]", where === "float" && "border-border bg-card shadow-float")}
          placeholder="Where do you want to go?"
          value={filters.search || ""}
          onChange={(v) => onFiltersChange({ ...filters, search: v })}
        />
      )}
      filters={(where) => (
        <>
          <SitFiltersButton filters={filters} onOpenFilters={onOpenFilters} floating={where === "float"} />
          <SitFilterTags filters={filters} onChange={onFiltersChange} floating={where === "float"} />
        </>
      )}
      onShowList={onShowList}
      topRight={
        user && (
          <Link to="/saved" className={cn("flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold", FLOAT)}>
            <Heart className="h-4 w-4" aria-hidden="true" />
            Saved
          </Link>
        )
      }
      renderMap={(m) => <ListingGoogleMap listings={onMap} selectedId={m.selectedId} onPick={m.onPick} padding={m.padding} focus={m.focus} />}
      renderCard={(l, c) => <SitMapCard listing={l} selected={c.selected} onPick={c.onPick} onSignUpPrompt={onSignUpPrompt} />}
      cardWidth="w-[300px] md:w-[330px]"
    />
  );
};

export default SitsMapView;
