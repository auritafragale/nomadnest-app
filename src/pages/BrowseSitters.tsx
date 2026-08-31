import { useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSitters } from "@/hooks/useSitters";
import SitterGridCard from "@/components/browse/SitterGridCard";
import SitterFilters from "@/components/browse/SitterFilters";
import BackToTopButton from "@/components/ui/BackToTopButton";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import Pagination from "@/components/browse/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { Users } from "lucide-react";


const SitterGoogleMap = lazy(() => import("@/components/maps/SitterGoogleMap"));

const ITEMS_PER_PAGE = 24;
const VIEW_MODE_KEY = "nomadnest_sitters_view";

const BrowseSitters = () => {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"grid" | "map">(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === "map" ? "map" : "grid";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPetTypes, setSelectedPetTypes] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedExperienceLevels, setSelectedExperienceLevels] = useState<string[]>([]);

  const { sitters, loading, error } = useSitters({
    searchQuery,
    petTypes: selectedPetTypes,
    languages: selectedLanguages,
    experienceLevels: selectedExperienceLevels,
  });

  const {
    currentPage,
    totalPages,
    paginatedItems,
    setCurrentPage,
    startIndex,
    endIndex,
    totalItems,
  } = usePagination({
    items: sitters,
    itemsPerPage: ITEMS_PER_PAGE,
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleViewModeChange = (mode: "grid" | "map") => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pt-16">
        {/* Header */}
        <div className="bg-surface border-b border-border">
          <div className="container py-5 md:py-8">
            <div className="flex items-center gap-1.5 mb-1">
              <h1 className="text-2xl md:text-4xl font-display">
                Browse Nomads
              </h1>
              <HelpTooltip
                label="About location privacy"
                content="For safety, exact home addresses stay hidden until a sit is confirmed. You'll see the city and approximate area until then."
              />
            </div>
            <p className="text-sm md:text-base text-muted-foreground">
              Find trusted nomads ready to care for your home and pets
            </p>
          </div>
        </div>

        {/* Filters */}
        <SitterFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedPetTypes={selectedPetTypes}
          onPetTypesChange={setSelectedPetTypes}
          selectedLanguages={selectedLanguages}
          onLanguagesChange={setSelectedLanguages}
          selectedExperienceLevels={selectedExperienceLevels}
          onExperienceLevelsChange={setSelectedExperienceLevels}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />

        {/* Results */}
        <div className="container py-4 md:py-8">
          {loading ? (
            <>
              <Skeleton className="h-5 w-32 mb-6" />
              {viewMode === "map" ? (
                <Skeleton className="w-full h-[600px] rounded-lg" />
              ) : (
                <div className="grid gap-3 md:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <Skeleton key={i} className="h-48 md:h-56 rounded-lg" />
                  ))}
                </div>
              )}
            </>
          ) : error && user ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                We couldn't load Nomad profiles just now. Please refresh and try again.
              </p>
            </div>
          ) : error || sitters.length === 0 ? (

            <div className="text-center py-16">
              <Users className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                {!user ? "Sign in to browse nomads" : "No nomads found"}
              </h3>
              <p className="text-muted-foreground">
                {!user
                  ? "Nomad profiles are only visible to members, to protect their privacy."
                  : searchQuery || selectedPetTypes.length > 0 || selectedLanguages.length > 0 || selectedExperienceLevels.length > 0
                    ? "Try adjusting your filters to find more nomads"
                    : "Be the first to create a nomad profile!"}
              </p>
              {!user && (
                <Button asChild className="mt-6">
                  <Link to="/auth">Log in or create a profile</Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              {viewMode !== "map" && (
                <p className="text-sm text-muted-foreground mb-4">
                  Showing {startIndex}–{endIndex} of {totalItems} nomad{totalItems !== 1 ? "s" : ""}
                </p>
              )}

              <div className="transition-opacity duration-300">
                {viewMode === "map" ? (
                  <Suspense fallback={<Skeleton className="w-full h-[600px] rounded-lg" />}>
                    <SitterGoogleMap sitters={sitters} />
                  </Suspense>
                ) : (
                  <>
                    <div className="grid gap-3 md:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                      {paginatedItems.map((sitter) => (
                        <SitterGridCard key={sitter.id} sitter={sitter} />
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
          )}
        </div>
      </main>

      <Footer />
      <BackToTopButton />
    </div>
  );
};

export default BrowseSitters;
