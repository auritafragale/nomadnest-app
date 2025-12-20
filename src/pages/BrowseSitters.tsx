import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  MapPin, Star, Search, SlidersHorizontal, Grid, List,
  Cat, Dog, MessageSquare, Languages
} from "lucide-react";

const BrowseSitters = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Sample sitters data
  const sitters = [
    {
      id: 1,
      name: "Emma Thompson",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop",
      location: "Currently in Lisbon, Portugal",
      headline: "Calm, reliable sitter who loves cats and routines",
      experience: "Experienced (20+ sits)",
      petTypes: ["Cat", "Dog"],
      languages: ["English", "Spanish"],
      rating: 4.9,
      reviewCount: 23,
      available: true,
    },
    {
      id: 2,
      name: "Marcus Chen",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop",
      location: "Currently in Berlin, Germany",
      headline: "Remote worker, great with anxious dogs",
      experience: "Intermediate (12 sits)",
      petTypes: ["Dog"],
      languages: ["English", "German", "Mandarin"],
      rating: 5.0,
      reviewCount: 12,
      available: true,
    },
    {
      id: 3,
      name: "Sofia Rodriguez",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop",
      location: "Currently in Buenos Aires, Argentina",
      headline: "Veterinary student, experienced with all pets",
      experience: "Experienced (35+ sits)",
      petTypes: ["Cat", "Dog", "Other"],
      languages: ["Spanish", "English", "Portuguese"],
      rating: 4.8,
      reviewCount: 35,
      available: true,
    },
    {
      id: 4,
      name: "James Wilson",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop",
      location: "Currently in Melbourne, Australia",
      headline: "Retired teacher, loves senior pets",
      experience: "Experienced (50+ sits)",
      petTypes: ["Cat", "Dog"],
      languages: ["English"],
      rating: 4.9,
      reviewCount: 48,
      available: false,
    },
    {
      id: 5,
      name: "Yuki Tanaka",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop",
      location: "Currently in Kyoto, Japan",
      headline: "Cat whisperer, quiet and respectful",
      experience: "Intermediate (8 sits)",
      petTypes: ["Cat"],
      languages: ["Japanese", "English"],
      rating: 5.0,
      reviewCount: 8,
      available: true,
    },
    {
      id: 6,
      name: "Alex & Sam",
      avatar: "https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?w=200&h=200&fit=crop",
      location: "Currently in Amsterdam, Netherlands",
      headline: "Traveling couple, love active dogs",
      experience: "Intermediate (15 sits)",
      petTypes: ["Dog"],
      languages: ["English", "Dutch", "French"],
      rating: 4.7,
      reviewCount: 15,
      available: true,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 pt-20">
        {/* Header */}
        <div className="bg-surface border-b border-border">
          <div className="container py-8">
            <h1 className="text-3xl md:text-4xl font-display mb-2">Browse Sitters</h1>
            <p className="text-muted-foreground">
              Find trusted pet sitters ready to care for your home and pets
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
                  placeholder="Search by location, experience, or languages..."
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
            Showing {sitters.length} sitters
          </p>

          <div className={`grid gap-6 ${
            viewMode === "grid" 
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" 
              : "grid-cols-1"
          }`}>
            {sitters.map((sitter) => (
              <Card 
                key={sitter.id} 
                variant="interactive" 
                className={`overflow-hidden group ${viewMode === "list" ? "flex flex-row" : ""}`}
              >
                <div className={`p-6 ${viewMode === "list" ? "flex gap-6 items-start" : ""}`}>
                  <div className={`${viewMode === "list" ? "flex-shrink-0" : "flex flex-col items-center text-center mb-4"}`}>
                    <Avatar className={`${viewMode === "list" ? "w-20 h-20" : "w-24 h-24 mb-3"}`}>
                      <AvatarImage src={sitter.avatar} alt={sitter.name} />
                      <AvatarFallback>{sitter.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    {viewMode !== "list" && (
                      <>
                        <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                          {sitter.name}
                        </h3>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Star className="w-4 h-4 text-accent fill-accent" />
                          {sitter.rating} ({sitter.reviewCount})
                        </div>
                      </>
                    )}
                  </div>

                  <div className={`${viewMode === "list" ? "flex-1" : ""}`}>
                    {viewMode === "list" && (
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                          {sitter.name}
                        </h3>
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="w-4 h-4 text-accent fill-accent" />
                          {sitter.rating} ({sitter.reviewCount})
                        </div>
                      </div>
                    )}

                    <p className={`text-sm text-muted-foreground ${viewMode === "list" ? "mb-2" : "mb-3 text-center"}`}>
                      {sitter.headline}
                    </p>

                    <div className={`space-y-2 ${viewMode === "list" ? "" : "text-center"}`}>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                        <MapPin className="w-4 h-4 flex-shrink-0" />
                        {sitter.location}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                        <Languages className="w-4 h-4 flex-shrink-0" />
                        {sitter.languages.join(", ")}
                      </div>
                    </div>

                    <div className={`flex flex-wrap gap-2 mt-4 ${viewMode === "list" ? "" : "justify-center"}`}>
                      {sitter.petTypes.map((pet, i) => (
                        <Badge key={i} variant="muted" className="gap-1">
                          {pet === "Cat" ? <Cat className="w-3 h-3" /> : <Dog className="w-3 h-3" />}
                          {pet}
                        </Badge>
                      ))}
                      <Badge variant={sitter.available ? "success" : "muted"}>
                        {sitter.available ? "Available" : "Booked"}
                      </Badge>
                    </div>

                    {viewMode === "list" && (
                      <div className="flex gap-3 mt-4">
                        <Button variant="outline" size="sm">
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Message
                        </Button>
                        <Button size="sm">Invite to sit</Button>
                      </div>
                    )}
                  </div>
                </div>

                {viewMode !== "list" && (
                  <div className="px-6 pb-6 flex gap-3">
                    <Button variant="outline" className="flex-1">
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Message
                    </Button>
                    <Button className="flex-1">Invite</Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default BrowseSitters;
