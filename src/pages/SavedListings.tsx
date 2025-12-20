import { useState } from "react";
import { Navigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useFavoritedListings } from "@/hooks/useFavorites";
import ListingCard from "@/components/browse/ListingCard";
import { useAuth } from "@/contexts/AuthContext";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const SavedListings = () => {
  const { user, loading: authLoading } = useAuth();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const { data: listings, isLoading } = useFavoritedListings();

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 pt-20 container py-8">
          <Skeleton className="h-10 w-48 mb-6" />
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-80 rounded-lg" />
            ))}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 pt-20">
        {/* Header */}
        <div className="bg-surface border-b border-border">
          <div className="container py-8">
            <div className="flex items-center gap-3 mb-2">
              <Heart className="w-8 h-8 text-primary" />
              <h1 className="text-3xl md:text-4xl font-display">Saved Listings</h1>
            </div>
            <p className="text-muted-foreground">
              Your saved pet sitting opportunities
            </p>
          </div>
        </div>

        {/* Results */}
        <div className="container py-8">
          {isLoading ? (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-80 rounded-lg" />
              ))}
            </div>
          ) : listings && listings.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                {listings.length} saved listing{listings.length !== 1 ? "s" : ""}
              </p>
              <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing: any) => (
                  <ListingCard key={listing.id} listing={listing} viewMode={viewMode} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Heart className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <h2 className="text-xl font-semibold mb-2">No saved listings yet</h2>
              <p className="text-muted-foreground mb-6">
                Browse sits and click the heart icon to save them for later
              </p>
              <Link to="/browse-sits">
                <Button>Browse Sits</Button>
              </Link>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SavedListings;