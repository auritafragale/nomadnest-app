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
    image: "https://images.unsplash.com/photo-1548802673-380ab8ebc7b7?w=600&h=400&fit=crop",
  },
  {
    id: 2,
    title: "Charming Alfama flat with a golden retriever",
    city: "Lisbon",
    country: "Portugal",
    start: "2026-06-02",
    end: "2026-06-19",
    pets: [{ type: "dog", name: "Biscuit" }],
    image: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=600&h=400&fit=crop",
  },
  {
    id: 3,
    title: "Tropical villa surrounded by rice fields",
    city: "Ubud",
    country: "Indonesia",
    start: "2026-07-03",
    end: "2026-07-20",
    pets: [{ type: "cat", name: "Kopi" }, { type: "dog", name: "Remy" }],
    image: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=600&h=400&fit=crop",
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
    image: "https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&h=400&fit=crop",
  },
  {
    id: 6,
    title: "Haussmann apartment steps from the Marais",
    city: "Paris",
    country: "France",
    start: "2026-09-14",
    end: "2026-10-01",
    pets: [{ type: "cat", name: "Brie" }],
    image: "https://images.unsplash.com/photo-1518717758536-85ae29035b6d?w=600&h=400&fit=crop",
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
        <div className="absolute top-2 left-2">
          {isPast(listing.end) ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/90 text-[10px] font-semibold text-muted-foreground backdrop-blur-sm">
              <CheckCircle2 className="w-2.5 h-2.5 text-success" />
              Past
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/90 text-[10px] font-semibold text-warning backdrop-blur-sm">
              <Clock className="w-2.5 h-2.5" />
              Reviewing
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-2.5 sm:p-4">
        <h3 className="font-semibold text-xs sm:text-base leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          {listing.title}
        </h3>

        <div className="space-y-1 mb-2">
          <div className="flex items-center gap-1 text-[11px] sm:text-sm text-muted-foreground">
            <MapPin className="w-3 h-3 flex-shrink-0 text-primary" />
            <span className="truncate">{listing.city}, {listing.country}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] sm:text-sm text-muted-foreground">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{formatRange(listing.start, listing.end)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-1">
          <div className="flex flex-wrap gap-1 min-w-0">
            {listing.pets.map((pet, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] sm:text-xs font-medium"
              >
                {pet.type === "cat" ? <Cat className="w-2.5 h-2.5" /> : <Dog className="w-2.5 h-2.5" />}
                <span className="truncate max-w-[60px] sm:max-w-none">{pet.name}</span>
              </span>
            ))}
          </div>
          <span className="text-[10px] sm:text-xs font-semibold text-primary group-hover:underline whitespace-nowrap">
            View
          </span>
        </div>
      </div>
    </div>
  </Link>
);

const FeaturedStaysSection = () => (
  <section className="py-12 bg-background">
    <div className="container">
      <div className="text-center mb-8">
        <span className="inline-block px-4 py-1.5 rounded-full bg-terracotta-light text-primary text-sm font-semibold mb-4">
          From Our Community
        </span>
        <h2 className="text-3xl md:text-4xl font-display mb-4">Recent Sits from Our Community</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          A taste of the sits our members have enjoyed — new opportunities are posted daily
        </p>
      </div>

      <div className="grid gap-2.5 sm:gap-4 grid-cols-2 lg:grid-cols-3">
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
