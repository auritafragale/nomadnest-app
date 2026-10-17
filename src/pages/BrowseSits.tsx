import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Map as MapIcon } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useListings, ListingFilters } from "@/hooks/useListings";
import ListingCard from "@/components/browse/ListingCard";
import { SitFilterBar, SitFiltersPanel, clearFilters } from "@/components/browse/SitFilters";
import SitsMapView from "@/components/browse/SitsMapView";
import BackToTopButton from "@/components/ui/BackToTopButton";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import Pagination from "@/components/browse/Pagination";
import SignUpPromptDialog from "@/components/auth/SignUpPromptDialog";
import { isStoreApp, STORE_MEMBERSHIP_LINE } from "@/lib/storeApp";
import { usePagination } from "@/hooks/usePagination";
import { useAuth } from "@/contexts/AuthContext";
import { NN_PAGE, RoleTheme, nnButton } from "@/components/nn/ui";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 12;
const VIEW_MODE_KEY = "nomadnest_browse_view";

/**
 * Browse Sits (design: BrowsePhone, BrowseTabletDark, BrowseDesktop; map view:
 * SitsMapPhone, SitsListPhone, SitsMapTabletDark, SitsMapDesktop).
 */
const BrowseSits = () => {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [viewMode, setViewMode] = useState<"grid" | "map">(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) === "map" ? "map" : "grid";
    } catch {
      return "grid";
    }
  });
  // The home page search sends ?q=.
  const [filters, setFilters] = useState<ListingFilters>(() => {
    const q = params.get("q")?.trim();
    return q ? { search: q } : {};
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  const { data: listings, isLoading, error, refetch } = useListings(filters);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  }, [viewMode]);

  const { currentPage, totalPages, paginatedItems, setCurrentPage, startIndex, endIndex, totalItems } = usePagination({
    items: listings || [],
    itemsPerPage: ITEMS_PER_PAGE,
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hasActiveFilters = Object.entries(filters).some(
    ([k, v]) => k !== "sortBy" && (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "" && v !== false),
  );

  const filtersPanel = (
    <SitFiltersPanel
      open={panelOpen}
      onOpenChange={setPanelOpen}
      filters={filters}
      onChange={setFilters}
      resultCount={isLoading ? null : listings?.length ?? 0}
    />
  );
  const signUpPrompt = (
    <SignUpPromptDialog
      open={promptOpen}
      onOpenChange={setPromptOpen}
      heart
      title="Save sits you love"
      message={
        isStoreApp()
          ? `Create a free account to save sits and see full profiles. ${STORE_MEMBERSHIP_LINE}`
          : "Create a free account to save sits and see full profiles. Membership from £59 a year when you are ready to apply."
      }
    />
  );

  // Map view: the map fills the screen; no footer.
  if (viewMode === "map") {
    return (
      <RoleTheme role="sitter">
        <Navbar wide />
        <SitsMapView
          user={user}
          listings={listings}
          isLoading={isLoading}
          error={error}
          refetch={() => void refetch()}
          filters={filters}
          onFiltersChange={setFilters}
          onOpenFilters={() => setPanelOpen(true)}
          onShowList={() => setViewMode("grid")}
          onSignUpPrompt={() => setPromptOpen(true)}
          hasActiveFilters={hasActiveFilters}
        />
        {filtersPanel}
        {signUpPrompt}
      </RoleTheme>
    );
  }

  return (
    <RoleTheme role="sitter" className="flex min-h-screen flex-col">
      <Navbar wide />

      <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-4 pb-12 pt-20 md:pt-24")}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h1 className="font-display text-[32px] font-normal leading-tight lg:text-[38px]">Browse Sits</h1>
            <HelpTooltip
              className="-my-3 h-11 w-11"
              label="How matching works"
              content="Matching works both ways. You apply to sits you like, and Pet Parents can invite you directly from your profile."
            />
          </div>
          <p className="text-[15px] text-muted-foreground">Homes and pets looking for a Nomad, all over the world.</p>
        </div>

        <SitFilterBar filters={filters} onChange={setFilters} onOpenFilters={() => setPanelOpen(true)} onShowMap={() => setViewMode("map")} />
        {filtersPanel}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-80 rounded-[22px]" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-[22px] border border-border p-8 text-center">
            <p className="text-[16px] font-bold">We couldn't load sits</p>
            <p className="text-[15px] text-muted-foreground">Check your connection and try again.</p>
            <button type="button" onClick={() => refetch()} className={nnButton("primary")}>
              Try again
            </button>
          </div>
        ) : listings && listings.length > 0 ? (
          <>
            <p className="text-[15px] text-muted-foreground">
              Showing {`${startIndex}–${endIndex} of ${totalItems}`} {totalItems === 1 ? "sit" : "sits"}
            </p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {paginatedItems.map((listing) => (
                <ListingCard key={listing.id} listing={listing} onSignUpPrompt={() => setPromptOpen(true)} />
              ))}
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} className="mt-4" />
          </>
        ) : hasActiveFilters ? (
          <div className="flex flex-col items-center gap-3 rounded-[22px] border border-dashed border-border p-8 text-center">
            <p className="text-[17px] font-bold">No sits match your filters</p>
            <p className="text-[15px] text-muted-foreground">Try different dates or fewer filters.</p>
            <button type="button" onClick={() => setFilters(clearFilters(filters))} className={nnButton("secondary")}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-[22px] border border-dashed border-border p-8 text-center">
            <p className="text-[17px] font-bold">No sits posted right now</p>
            <p className="text-[15px] text-muted-foreground">
              NomadNest is young and new homes are added every week. Finish your Nomad profile so Pet Parents can invite you
              directly.
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
        )}
      </main>

      {/* Phone and tablet: the floating Map pill, above the bottom bar. */}
      <button
        type="button"
        onClick={() => setViewMode("map")}
        className={cn(
          "fixed left-1/2 z-40 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--nn-ink)] px-5 text-[15px] font-bold text-[var(--nn-ink-text)] shadow-[var(--nn-float-shadow)] md:bottom-6 lg:hidden",
          user ? "bottom-[calc(5rem+env(safe-area-inset-bottom))]" : "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
        )}
      >
        <MapIcon className="h-[18px] w-[18px]" aria-hidden="true" />
        Map
      </button>

      {signUpPrompt}
      <Footer />
      <BackToTopButton />
    </RoleTheme>
  );
};

export default BrowseSits;
