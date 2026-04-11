import { useState, lazy, Suspense } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useListings, ListingFilters } from "@/hooks/useListings";
import ListingCard from "@/components/browse/ListingCard";
import ListingFiltersComponent from "@/components/browse/ListingFilters";
import BackToTopButton from "@/components/ui/BackToTopButton";
import Pagination from "@/components/browse/Pagination";
import { usePagination } from "@/hooks/usePagination";

const ListingMap = lazy(() => import("@/components/browse/ListingMap"));

const ITEMS_PER_PAGE = 12;

const BrowseSits = () => {
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [filters, setFilters] = useState<ListingFilters>({});
  
  const { data: listings, isLoading, error } = useListings(filters);

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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 pt-20">
        {/* Header */}
        <div className="bg-surface border-b border-border">
          <div className="container py-8">
            <h1 className="text-3xl md:text-4xl font-display mb-2">Browse Sits</h1>
            <p className="text-muted-foreground">
              Find your perfect pet sitting opportunity worldwide
            </p>
          </div>
        </div>

        {/* Search & Filters */}
        <ListingFiltersComponent
          filters={filters}
          onFiltersChange={setFilters}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {/* Results */}
        <div className="container py-8">
          {isLoading ? (
            <>
              <Skeleton className="h-5 w-32 mb-6" />
              {viewMode === "map" ? (
                <Skeleton className="w-full h-[600px] rounded-lg" />
              ) : (
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
              <p className="text-sm text-muted-foreground mb-6">
                Showing {viewMode === "map" ? totalItems : `${startIndex}-${endIndex} of ${totalItems}`} sit{totalItems !== 1 ? "s" : ""}
              </p>

              {viewMode === "map" ? (
                <Suspense fallback={<Skeleton className="w-full h-[600px] rounded-lg" />}>
                  <ListingMap listings={listings} />
                </Suspense>
              ) : (
                <>
                  <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-2">No sits found matching your criteria.</p>
              <p className="text-sm text-muted-foreground">Try adjusting your search or filters.</p>
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
