import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, ArrowRight, Cat, Dog, CheckCircle2, Clock } from "lucide-react";

interface DemoListing {
  id: number;
  title: string;
  city: string;
  country: string;
  start: string;
  end: string;
  pets: { type: "cat" | "dog"; name: string }[];
  image: string;
}

const DEMO_LISTINGS: DemoListing[] = [
  {
    id: 1,
    title: "Sunny terrace apartment with two friendly cats",
    city: "Barcelona",
    country: "Spain",
    start: "2026-05-08",
    end: "2026-05-24",
    pets: [{ type: "cat", name: "Luna" }, { type: "cat", name: "Mochi" }],
    image: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=400&fit=crop",
  },
  {
    id: 2,
    title: "Charming Alfama flat with a golden retriever",
    city: "Lisbon",
    country: "Portugal",
    start: "2026-06-02",
    end: "2026-06-19",
    pets: [{ type: "dog", name: "Biscuit" }],
    image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop",
  },
  {
    id: 3,
    title: "Tropical villa surrounded by rice fields",
    city: "Ubud",
    country: "Indonesia",
    start: "2026-07-03",
    end: "2026-07-20",
    pets: [{ type: "cat", name: "Kopi" }, { type: "dog", name: "Remy" }],
    image: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600&h=400&fit=crop",
  },
  {
    id: 4,
    title: "Cosy stone cottage near Arthur's Seat",
    city: "Edinburgh",
    country: "UK",
    start: "2026-07-28",
    end: "2026-08-12",
    pets: [{ type: "dog", name: "Angus" }],
    image: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&h=400&fit=crop",
  },
  {
    id: 5,
    title: "Modern home with sea views and two cats",
    city: "Cape Town",
    country: "South Africa",
    start: "2026-09-05",
    end: "2026-09-22",
    pets: [{ type: "cat", name: "Atlas" }, { type: "cat", name: "Sage" }],
    image: "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600&h=400&fit=crop",
  },
  {
    id: 6,
    title: "Haussmann apartment steps from the Marais",
    city: "Paris",
    country: "France",
    start: "2026-09-14",
    end: "2026-10-01",
    pets: [{ type: "cat", name: "Brie" }],
    image: "https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=600&h=400&fit=crop",
  },
  {
    id: 7,
    title: "Bright South Congress bungalow with a labrador",
    city: "Austin",
    country: "USA",
    start: "2026-10-06",
    end: "2026-10-23",
    pets: [{ type: "dog", name: "Tex" }],
    image: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=400&fit=crop",
  },
  {
    id: 8,
    title: "Fitzroy terrace house with cat and garden",
    city: "Melbourne",
    country: "Australia",
    start: "2026-11-02",
    end: "2026-11-19",
    pets: [{ type: "cat", name: "Pepper" }],
    image: "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=600&h=400&fit=crop",
  },
];

const formatRange = (start: string, end: string) => {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString("en-GB", opts)} \u2013 ${e.toLocaleDateString("en-GB", opts)}, ${e.getFullYear()}`;
};

const isPast = (end: string) => new Date(end).getTime() < Date.now();

const DemoCard = ({ listing }: { listing: DemoListing }) => (
  <Link to="/browse-sits" className="group block">
    <div className="rounded-xl overflow-hidden border border-border bg-surface shadow-soft hover:shadow-md hover:-translate-y-1 transition-all duration-300">
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={listing.image}
          alt={listing.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        {/* Status badge */}
        <div className="absolute top-3 left-3">
          {isPast(listing.end) ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 text-xs font-semibold text-muted-foreground backdrop-blur-sm">
              <CheckCircle2 className="w-3 h-3 text-success" />
              Past Sit
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 text-xs font-semibold text-warning backdrop-blur-sm">
              <Clock className="w-3 h-3" />
              Reviewing
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-base leading-snug mb-3 line-clamp-2 group-hover:text-primary transition-colors">
          {listing.title}
        </h3>

        <div className="space-y-1.5 mb-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
            <span className="truncate">{listing.city}, {listing.country}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{formatRange(listing.start, listing.end)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {listing.pets.map((pet, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium"
              >
                {pet.type === "cat" ? <Cat className="w-3 h-3" /> : <Dog className="w-3 h-3" />}
                {pet.name}
              </span>
            ))}
          </div>
          <span className="text-xs font-semibold text-primary group-hover:underline whitespace-nowrap">
            View Sits
          </span>
        </div>
      </div>
    </div>
  </Link>
);

const FeaturedStaysSection = () => (
  <section className="py-20 bg-background">
    <div className="container">
      <div className="text-center mb-12">
        <span className="inline-block px-4 py-1.5 rounded-full bg-terracotta-light text-primary text-sm font-semibold mb-4">
          From Our Community
        </span>
        <h2 className="text-3xl md:text-4xl font-display mb-4">Recent Sits from Our Community</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          A taste of the sits our members have enjoyed — new opportunities are posted daily
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {DEMO_LISTINGS.map((listing) => (
          <DemoCard key={listing.id} listing={listing} />
        ))}
      </div>

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

export default FeaturedStaysSection;
