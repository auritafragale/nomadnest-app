import { useState, useMemo, useEffect } from "react";
import { Map as MapIcon, Sparkles } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useSitters } from "@/hooks/useSitters";
import { useNomadMatch } from "@/hooks/useNomadMatch";
import NomadBrowseCard from "@/components/browse/NomadBrowseCard";
import { EMPTY_NOMAD_FILTERS, NomadFilterBar, NomadFiltersPanel, nomadFilterCount, type NomadFilterState } from "@/components/browse/NomadFilters";
import NomadsMapView from "@/components/browse/NomadsMapView";
import BackToTopButton from "@/components/ui/BackToTopButton";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import Pagination from "@/components/browse/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { NN_PAGE, RoleTheme, nnButton } from "@/components/nn/ui";
import { cn } from "@/lib/utils";
import MembersOnlyNotice from "@/components/nn/MembersOnlyNotice";

const ITEMS_PER_PAGE = 24;
const VIEW_MODE_KEY = "nomadnest_sitters_view";

/** Browse Nomads (design: NomadsPhone, NomadsTabletDark, NomadsDesktop; map view: NomadsMapPhone, NomadsMapDesktop). */
const BrowseSitters = () => {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"grid" | "map">(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) === "map" ? "map" : "grid";
    } catch {
      return "grid";
    }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<NomadFilterState>(EMPTY_NOMAD_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [bestMatch, setBestMatch] = useState(false);

  const { sitters, loading, error, authError, refetch } = useSitters({
    searchQuery,
    petTypes: filters.petTypes,
    languages: filters.languages,
    experienceLevels: filters.experienceLevels,
  });
  const { visible: matchVisible, city: matchCity, match } = useNomadMatch(bestMatch);

  // Best match: the AI's order first (with its reason), then everyone else.
  const matchOn = matchVisible && bestMatch && !!match.data;
  const reasons = useMemo(() => new Map((match.data ?? []).map((m) => [m.user_id, m.reason])), [match.data]);
  const ordered = useMemo(() => {
    if (!matchOn) return sitters;
    const rank = new Map((match.data ?? []).map((m, i) => [m.user_id, i]));
    return [...sitters].sort((a, b) => (rank.get(a.user_id) ?? 1e6) - (rank.get(b.user_id) ?? 1e6));
  }, [sitters, matchOn, match.data]);

  const { currentPage, totalPages, paginatedItems, setCurrentPage, startIndex, endIndex, totalItems } = usePagination({
    items: ordered,
    itemsPerPage: ITEMS_PER_PAGE,
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  }, [viewMode]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filtered = !!searchQuery || nomadFilterCount(filters) > 0;
  const membersOnly = (!user && !loading) || !!authError;
  const panel = (
    <NomadFiltersPanel open={panelOpen} onOpenChange={setPanelOpen} filters={filters} onChange={setFilters} resultCount={loading ? null : sitters.length} />
  );

  // Map view: the map fills the screen; no footer.
  if (viewMode === "map") {
    return (
      <RoleTheme role="owner">
        <Navbar wide />
        <NomadsMapView
          user={user}
          membersOnly={membersOnly}
          sitters={sitters}
          loading={loading}
          error={error}
          refetch={() => void refetch()}
          search={searchQuery}
          onSearch={setSearchQuery}
          filters={filters}
          onFiltersChange={setFilters}
          onOpenFilters={() => setPanelOpen(true)}
          onClearAll={() => {
            setFilters(EMPTY_NOMAD_FILTERS);
            setSearchQuery("");
          }}
          onShowList={() => setViewMode("grid")}
        />
        {panel}
      </RoleTheme>
    );
  }

  return (
    <RoleTheme role="owner" className="flex min-h-screen flex-col">
      <Navbar wide />

      <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-4 pb-28 pt-20 md:pt-24 lg:pb-12")}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h1 className="font-display text-[32px] font-normal leading-tight lg:text-[38px]">Browse Nomads</h1>
            <HelpTooltip
              className="-my-3 h-11 w-11"
              label="About location privacy"
              content="For safety, exact home addresses stay hidden until a sit is confirmed. You'll see the city and approximate area until then."
            />
          </div>
          <p className="text-[15px] text-muted-foreground">Trusted Nomads ready to look after your home and pets.</p>
        </div>

        {membersOnly ? (
          <MembersOnlyNotice headingLevel="h2" />
        ) : (
          <>
            <NomadFilterBar
              search={searchQuery}
              onSearch={setSearchQuery}
              filters={filters}
              onChange={setFilters}
              onOpenFilters={() => setPanelOpen(true)}
              onShowMap={() => setViewMode("map")}
            />
            {panel}

            {matchVisible && (
              <div
                className={cn(
                  "flex min-h-[64px] items-center gap-3 rounded-[18px] border-[1.5px] px-4 py-2.5",
                  bestMatch ? "border-[var(--nn-accent)] bg-[var(--nn-tint)]" : "border-border bg-card",
                )}
              >
                <Sparkles className="h-5 w-5 shrink-0 text-[var(--nn-accent-dark)]" aria-hidden="true" />
                <label htmlFor="best-match" className="flex min-w-0 flex-1 cursor-pointer flex-col">
                  <span className="text-[15px] font-bold">Best match for your {matchCity || "next"} sit</span>
                  <span className="text-sm text-muted-foreground">
                    {bestMatch && match.isFetching ? "Sorting Nomads by your dates and pets…" : "AI sorts Nomads by your dates and pets"}
                  </span>
                </label>
                <Switch id="best-match" checked={bestMatch} onCheckedChange={setBestMatch} />
              </div>
            )}
            {matchVisible && bestMatch && match.error && (
              <p role="alert" className="text-[15px] text-muted-foreground">
                {(match.error as Error).message}
              </p>
            )}

            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-60 rounded-[22px]" />
                ))}
              </div>
            ) : error ? (
              <div role="alert" className="flex flex-col items-center gap-3 rounded-[22px] border border-border p-8 text-center">
                <p className="text-[17px] font-bold">We couldn't load Nomads</p>
                <p className="text-[15px] text-muted-foreground">Check your connection and try again.</p>
                <button type="button" onClick={() => refetch()} className={nnButton("primary")}>
                  Try again
                </button>
              </div>
            ) : sitters.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[22px] border border-dashed border-border p-8 text-center">
                <p className="text-[17px] font-bold">{filtered ? "No Nomads match" : "No Nomads here yet"}</p>
                <p className="text-[15px] text-muted-foreground">{filtered ? "Try fewer filters." : "Be the first to create a Nomad profile!"}</p>
                {filtered && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters(EMPTY_NOMAD_FILTERS);
                      setSearchQuery("");
                    }}
                    className={nnButton("secondary")}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-[15px] text-muted-foreground">
                  Showing {startIndex}–{endIndex} of {totalItems} {totalItems === 1 ? "Nomad" : "Nomads"}
                  {matchOn && " · best match first"}
                </p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {paginatedItems.map((sitter) => (
                    <NomadBrowseCard key={sitter.id} sitter={sitter} reason={matchOn ? reasons.get(sitter.user_id) : null} />
                  ))}
                </div>
                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} className="mt-4" />
              </>
            )}
          </>
        )}
      </main>

      {/* Phone and tablet: the floating Map pill, above the bottom bar. */}
      {!membersOnly && (
        <button
          type="button"
          onClick={() => setViewMode("map")}
          className={cn(
            "fixed left-1/2 z-40 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--nn-ink)] px-5 text-[15px] font-bold text-[var(--nn-ink-text)] shadow-float md:bottom-6 lg:hidden",
            user ? "bottom-[calc(5rem+env(safe-area-inset-bottom))]" : "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
          )}
        >
          <MapIcon className="h-[18px] w-[18px]" aria-hidden="true" />
          Map
        </button>
      )}

      <Footer />
      <BackToTopButton />
    </RoleTheme>
  );
};

export default BrowseSitters;
