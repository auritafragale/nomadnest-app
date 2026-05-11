import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Home } from "lucide-react";
import { useListings } from "@/hooks/useListings";
import ListingCard from "@/components/browse/ListingCard";

const FeaturedStaysSection = () => {
  const { data: allListings, isLoading } = useListings({});

  const featured = allListings
    ? allListings.filter((l) => l.photos && l.photos.length > 0).slice(0, 8)
    : [];

  return (
    <section className="py-20 bg-background">
      <div className="container">
        {/* Heading */}
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-1.5 rounded-full bg-terracotta-light text-primary text-sm font-semibold mb-4">
            Live Listings
          </span>
          <h2 className="text-3xl md:text-4xl font-display mb-4">Explore Amazing Stays</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Discover homes and pets waiting for you around the world
          </p>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div className="text-center py-16">
            <Home className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No listings available right now — check back soon!</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {featured.map((listing) => (
              <ListingCard key={listing.id} listing={listing} viewMode="grid" />
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="flex justify-center mt-10">
          <Link to="/browse-sits">
            <Button variant="hero" size="lg" className="group">
              View All Sits
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default FeaturedStaysSection;
