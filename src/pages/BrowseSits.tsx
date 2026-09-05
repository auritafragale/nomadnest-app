import { useState, lazy, Suspense, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useListings, ListingFilters } from "@/hooks/useListings";
import ListingCard from "@/components/browse/ListingCard";
import ListingFiltersComponent from "@/components/browse/ListingFilters";
import BackToTopButton from "@/components/ui/BackToTopButton";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import Pagination from "@/components/browse/Pagination";
import { usePagination } from "@/hooks/usePagination";
import FilterBottomSheet, { MobileFilters, sitDetailKeys } from "@/components/mobile/FilterBottomSheet";

const ListingGoogleMap = lazy(() => import("@/components/maps/ListingGoogleMap"));

const ITEMS_PER_PAGE = 12;
const VIEW_MODE_KEY = "nomadnest_browse_view";

const BrowseSits = () => {
  const [viewMode, setViewMode] = useState<"grid" | "map">(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === "map" ? "map" : "grid";
  });
  const [filters, setFilters] = useState<ListingFilters>({});
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileFilters, setMobileFilters] = useState<MobileFilters>({
    lastMinute: false,
    reasons: [],
    petTypes: [],
    sitDetails: [],
  });

  const handleMobileFiltersApply = (mf: MobileFilters) => {
    setMobileFilters(mf);
    setFilters((prev) => ({
      ...prev,
      lastMinute: mf.lastMinute || undefined,
      petTypes: mf.petTypes.length > 0 ? mf.petTypes : undefined,
      ...Object.fromEntries(
        sitDetailKeys.map((k) => [k, mf.sitDetails.includes(k) ? true : undefined])
      ),
      startDate: mf.dateRange?.from ? mf.dateRange.from.toISOString().split("T")[0] : undefined,
      endDate: mf.dateRange?.to ? mf.dateRange.to.toISOString().split("T")[0] : undefined,
    }));
  };

  const { data: listings, isLoading, error } = useListings(filters);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const {
    currentPage,
    totalPages,
    paginatedItems,
    setCurrentPage,
    startIndex,
    endIndex,
    totalItems,
  } = usePagination({
    items: listings || [],
    itemsPerPage: ITEMS_PER_PAGE,
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hasActiveFilters =
    Object.values(filters).some((v) =>
      Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "" && v !== false
    );

  const mobileFilterActive =
    mobileFilters.lastMinute ||
    mobileFilters.reasons.length > 0 ||
    mobileFilters.petTypes.length > 0 ||
    mobileFilters.sitDetails.length > 0 ||
    !!mobileFilters.dateRange?.from;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pt-16">
        <div className="bg-surface border-b border-border">
          <div className="container py-6 md:py-8">
            <div className="flex items-center gap-1.5 mb-1">
              <h1 className="text-2xl md:text-4xl font-display">Browse Sits</h1>
              <HelpTooltip
                label="How matching works"
                content="Matching works both ways: as a Nomad you apply to sits that interest you, and Pet Parents can also invite you directly to their listings."
              />
            </div>
            <p className="text-sm md:text-base text-muted-foreground">
              Find your perfect pet sitting opportunity worldwide
            </p>
          </div>
        </div>

        <ListingFiltersComponent
          filters={filters}
          onFiltersChange={setFilters}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onMobileFiltersOpen={() => setMobileFilterOpen(true)}
          mobileFilterActive={mobileFilterActive}
        />

        <FilterBottomSheet
          open={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          filters={mobileFilters}
          onApply={handleMobileFiltersApply}
        />

        <div className="container py-6 md:py-8">
          {isLoading ? (
            <>
              <Skeleton className="h-5 w-32 mb-6" />
              {viewMode === "map" ? (
                <Skeleton className="w-full h-[600px] rounded-lg" />
              ) : (
                <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-80 rounded-lg" />
                  ))}
                </div>
              )}
            </>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Failed to load listings. Please try again.</p>
            </div>
          ) : listings && listings.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4 md:mb-6">
                Showing {viewMode === "map" ? totalItems : `${startIndex}-${endIndex} of ${totalItems}`} sit{totalItems !== 1 ? "s" : ""}
              </p>

              <div className="transition-opacity duration-300">
                {viewMode === "map" ? (
                  <Suspense fallback={<Skeleton className="w-full h-[600px] rounded-lg" />}>
                    <ListingGoogleMap listings={listings} />
                  </Suspense>
                ) : (
                  <>
                    <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-2 lg:grid-cols-3">
                      {paginatedItems.map((listing) => (
                        <ListingCard key={listing.id} listing={listing} viewMode="grid" />
                      ))}
                    </div>

                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={handlePageChange}
                      className="mt-8"
                    />
                  </>
                )}
              </div>
            </>
          ) : hasActiveFilters ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-2">No sits found matching your criteria.</p>
              <p className="text-sm text-muted-foreground">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div className="text-center py-12 max-w-md mx-auto">
              <p className="text-lg font-medium text-foreground mb-2">
                No sits posted right now
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                NomadNest is young and new homes are added every week. Complete your Nomad
                profile so Pet Parents can invite you directly — that is how most early
                matches happen.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button asChild>
                  <Link to="/edit-sitter-profile">Complete my profile</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/find-nomads">Find Nomads near me</Link>
                </Button>
              </div>
            </div>
          )}

        </div>
      </main>

      <Footer />
      <BackToTopButton />
    </div>
  );
};

export default BrowseSits;
