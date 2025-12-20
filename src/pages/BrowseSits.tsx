import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  MapPin, Calendar, Cat, Dog, Wifi, Search, 
  SlidersHorizontal, Grid, List, Heart
} from "lucide-react";

const BrowseSits = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Sample listings data
  const listings = [
    {
      id: 1,
      title: "Sunny Barcelona flat with playful cat",
      location: "Barcelona, Spain",
      dates: "Jan 15 - Feb 2, 2025",
      pets: [{ type: "Cat", name: "Luna" }],
      amenities: ["wifi", "balcony", "workspace"],
      image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&h=400&fit=crop",
      status: "published",
    },
    {
      id: 2,
      title: "Cozy London home with two golden retrievers",
      location: "London, UK",
      dates: "Feb 10 - Feb 28, 2025",
      pets: [{ type: "Dog", name: "Max" }, { type: "Dog", name: "Bella" }],
      amenities: ["wifi", "garden", "parking"],
      image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&h=400&fit=crop",
      status: "published",
    },
    {
      id: 3,
      title: "Modern Tokyo apartment with senior cat",
      location: "Tokyo, Japan",
      dates: "Mar 5 - Mar 20, 2025",
      pets: [{ type: "Cat", name: "Mochi" }],
      amenities: ["wifi", "workspace", "ac"],
      image: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&h=400&fit=crop",
      status: "published",
    },
    {
      id: 4,
      title: "Charming Paris studio with friendly poodle",
      location: "Paris, France",
      dates: "Apr 1 - Apr 15, 2025",
      pets: [{ type: "Dog", name: "Coco" }],
      amenities: ["wifi", "balcony"],
      image: "https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=600&h=400&fit=crop",
      status: "published",
    },
    {
      id: 5,
      title: "Beachside Sydney house with two cats",
      location: "Sydney, Australia",
      dates: "May 10 - Jun 5, 2025",
      pets: [{ type: "Cat", name: "Oscar" }, { type: "Cat", name: "Olive" }],
      amenities: ["wifi", "garden", "pool"],
      image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&h=400&fit=crop",
      status: "published",
    },
    {
      id: 6,
      title: "Mountain cabin in Colorado with husky",
      location: "Denver, USA",
      dates: "Jun 15 - Jul 1, 2025",
      pets: [{ type: "Dog", name: "Ghost" }],
      amenities: ["wifi", "fireplace", "hiking"],
      image: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=600&h=400&fit=crop",
      status: "published",
    },
  ];

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
        <div className="bg-surface border-b border-border sticky top-16 z-40">
          <div className="container py-4">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search by location, pet type, or dates..."
                  className="pl-10 h-12"
                />
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <Button variant="outline" className="flex-1 md:flex-none">
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Filters
                </Button>
                <div className="flex items-center border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2.5 ${viewMode === "grid" ? "bg-muted" : "bg-surface hover:bg-muted/50"}`}
                  >
                    <Grid className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-2.5 ${viewMode === "list" ? "bg-muted" : "bg-surface hover:bg-muted/50"}`}
                  >
                    <List className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="container py-8">
          <p className="text-sm text-muted-foreground mb-6">
            Showing {listings.length} sits
          </p>

          <div className={`grid gap-6 ${
            viewMode === "grid" 
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" 
              : "grid-cols-1"
          }`}>
            {listings.map((listing) => (
              <Card 
                key={listing.id} 
                variant="interactive" 
                className={`overflow-hidden group ${viewMode === "list" ? "flex flex-row" : ""}`}
              >
                <div className={`relative overflow-hidden ${
                  viewMode === "list" ? "w-64 flex-shrink-0" : "aspect-[4/3]"
                }`}>
                  <img
                    src={listing.image}
                    alt={listing.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <button className="absolute top-3 right-3 w-9 h-9 rounded-full bg-surface/90 flex items-center justify-center hover:bg-surface transition-colors">
                    <Heart className="w-5 h-5 text-muted-foreground hover:text-primary" />
                  </button>
                  <div className="absolute bottom-3 left-3">
                    <Badge variant="published">Open</Badge>
                  </div>
                </div>
                <div className="p-5 flex-1">
                  <h3 className="font-semibold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                    {listing.title}
                  </h3>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      {listing.location}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4 flex-shrink-0" />
                      {listing.dates}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {listing.pets.map((pet, i) => (
                      <Badge key={i} variant="muted" className="gap-1">
                        {pet.type === "Cat" ? <Cat className="w-3 h-3" /> : <Dog className="w-3 h-3" />}
                        {pet.name}
                      </Badge>
                    ))}
                    {listing.amenities.includes("wifi") && (
                      <Badge variant="muted" className="gap-1">
                        <Wifi className="w-3 h-3" />
                        Wi-Fi
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default BrowseSits;
