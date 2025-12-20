import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useSitters } from "@/hooks/useSitters";
import SitterCard from "@/components/browse/SitterCard";
import SitterFilters from "@/components/browse/SitterFilters";
import BackToTopButton from "@/components/ui/BackToTopButton";
import { Users } from "lucide-react";

const BrowseSitters = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pt-20">
        {/* Header */}
        <div className="bg-surface border-b border-border">
          <div className="container py-8">
            <h1 className="text-3xl md:text-4xl font-display mb-2">
              Browse Sitters
            </h1>
            <p className="text-muted-foreground">
              Find trusted pet sitters ready to care for your home and pets
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
          onViewModeChange={setViewMode}
        />

        {/* Results */}
        <div className="container py-8">
          {loading ? (
            <>
              <Skeleton className="h-5 w-32 mb-6" />
              <div
                className={`grid gap-6 ${
                  viewMode === "grid"
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-1"
                }`}
              >
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton
                    key={i}
                    className={viewMode === "grid" ? "h-80" : "h-48"}
                  />
                ))}
              </div>
            </>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-destructive">{error}</p>
            </div>
          ) : sitters.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No sitters found</h3>
              <p className="text-muted-foreground">
                {searchQuery || selectedPetTypes.length > 0 || selectedLanguages.length > 0 || selectedExperienceLevels.length > 0
                  ? "Try adjusting your filters to find more sitters"
                  : "Be the first to create a sitter profile!"}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                Showing {sitters.length} sitter{sitters.length !== 1 ? "s" : ""}
              </p>

              <div
                className={`grid gap-6 ${
                  viewMode === "grid"
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-1"
                }`}
              >
                {sitters.map((sitter) => (
                  <SitterCard
                    key={sitter.id}
                    sitter={sitter}
                    viewMode={viewMode}
                  />
                ))}
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
