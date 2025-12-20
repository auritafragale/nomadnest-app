import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Cat, Dog, Wifi } from "lucide-react";

const ExploreSection = () => {
  // Sample preview data
  const sampleListings = [
    {
      id: 1,
      title: "Sunny Barcelona flat with playful cat",
      location: "Barcelona, Spain",
      dates: "Jan 15 - Feb 2",
      pets: ["Cat"],
      amenities: ["wifi", "balcony"],
      image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=300&fit=crop",
    },
    {
      id: 2,
      title: "Cozy London home with two golden retrievers",
      location: "London, UK",
      dates: "Feb 10 - Feb 28",
      pets: ["Dog", "Dog"],
      amenities: ["wifi", "garden"],
      image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=300&fit=crop",
    },
    {
      id: 3,
      title: "Modern Tokyo apartment with senior cat",
      location: "Tokyo, Japan",
      dates: "Mar 5 - Mar 20",
      pets: ["Cat"],
      amenities: ["wifi", "workspace"],
      image: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=400&h=300&fit=crop",
    },
  ];

  return (
    <section className="py-20 bg-surface">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display mb-4">
            Explore sits and sitters worldwide
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Search by dates, location, pet type, lifestyle fit, and house needs.
          </p>
        </div>

        {/* Preview cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12 max-w-5xl mx-auto">
          {sampleListings.map((listing) => (
            <Card key={listing.id} variant="interactive" className="overflow-hidden group">
              <div className="aspect-[4/3] relative overflow-hidden">
                <img
                  src={listing.image}
                  alt={listing.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <h3 className="text-surface font-semibold line-clamp-2">
                    {listing.title}
                  </h3>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  {listing.location}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  {listing.dates}
                </div>
                <div className="flex flex-wrap gap-2">
                  {listing.pets.map((pet, i) => (
                    <Badge key={i} variant="muted" className="gap-1">
                      {pet === "Cat" ? <Cat className="w-3 h-3" /> : <Dog className="w-3 h-3" />}
                      {pet}
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

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/browse-sits">
            <Button size="lg">Browse sits</Button>
          </Link>
          <Link to="/browse-sitters">
            <Button variant="outline-secondary" size="lg">
              Browse sitters
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default ExploreSection;
