import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, MapPin } from "lucide-react";
import whiteLogo from "@/assets/White_Logo.png";
import { useCityPredictions } from "@/hooks/useCityPredictions";

const IMAGES = ["/hero-1.jpg", "/hero-2.jpg", "/hero-3.jpg"];
const INTERVAL = 5500;

const HeroSection = () => {
  const [current, setCurrent] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const { predictions, clear } = useCityPredictions(searchQuery);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => {
      const nextIndex = (current + 1) % IMAGES.length;
      setNext(nextIndex);
      setFading(true);
      setTimeout(() => {
        setCurrent(nextIndex);
        setNext(null);
        setFading(false);
      }, 1000);
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [current]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/browse-sits${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}`);
  };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Slideshow background */}
      <div className="absolute inset-0">
        {/* Current image */}
        <img
          key={current}
          src={IMAGES[current]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          style={{ opacity: fading ? 0 : 1, transition: "opacity 1000ms ease-in-out" }}
        />
        {/* Next image (fades in beneath) */}
        {next !== null && (
          <img
            key={next}
            src={IMAGES[next]}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{ opacity: fading ? 1 : 0, transition: "opacity 1000ms ease-in-out" }}
          />
        )}
        {/* Dark overlay for text legibility */}
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full container flex flex-col items-center text-center pt-24 pb-16 px-4">
        {/* Logo */}
        <img
          src={whiteLogo}
          alt="NomadNest"
          className="h-14 md:h-16 w-auto mb-8 animate-fade-up"
          style={{ animationDelay: "0.05s" }}
        />

        {/* Tagline */}
        <h1
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display text-white leading-tight mb-4 max-w-4xl animate-fade-up"
          style={{ animationDelay: "0.1s" }}
        >
          Where Travellers Find Homes &amp; Pets Find Care
        </h1>

        {/* Subheading */}
        <p
          className="text-base md:text-xl text-white/90 max-w-2xl mb-8 animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          Join 900+ members in our global community. No booking fees. Just adventure.
        </p>

        {/* CTAs */}
        <div
          className="flex flex-col sm:flex-row gap-3 mb-10 animate-fade-up w-full sm:w-auto"
          style={{ animationDelay: "0.3s" }}
        >
          <Link to="/auth?signup=true&role=sitter" className="w-full sm:w-auto">
            <Button
              size="xl"
              className="w-full sm:w-auto bg-primary text-white border-2 border-white/30 hover:bg-primary/90 shadow-xl hover:-translate-y-1 transition-all"
            >
              Join as a Nomad
            </Button>
          </Link>
          <Link to="/auth?signup=true&role=owner" className="w-full sm:w-auto">
            <Button
              size="xl"
              className="w-full sm:w-auto bg-transparent text-white border-2 border-white hover:bg-white hover:text-primary shadow-xl hover:-translate-y-1 transition-all"
            >
              List Your Home
            </Button>
          </Link>
        </div>

        {/* Search bar */}
        <form
          onSubmit={handleSearch}
          className="w-full max-w-xl animate-fade-up"
          style={{ animationDelay: "0.4s" }}
        >
          <div className="relative">
          <div className="flex items-center bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 pl-4 text-muted-foreground flex-shrink-0">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <input
              type="text"
              placeholder="Where are you going?"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => window.setTimeout(() => setSuggestOpen(false), 120)}
              autoComplete="off"
              className="flex-1 h-14 px-3 text-foreground bg-transparent focus:outline-none placeholder:text-muted-foreground text-base"
            />
            <button
              type="submit"
              className="h-14 px-5 bg-primary text-white font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2 flex-shrink-0"
            >
              <Search className="w-5 h-5" />
              <span className="hidden sm:inline">Search</span>
            </button>
          </div>
          {suggestOpen && predictions.length > 0 && (
            <ul className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden text-left">
              {predictions.map((p) => (
                <li
                  key={p.place_id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSearchQuery(p.description);
                    clear();
                    setSuggestOpen(false);
                  }}
                  className="flex items-center gap-2 px-4 py-3 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                >
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{p.description}</span>
                </li>
              ))}
            </ul>
          )}
          </div>
        </form>

        {/* Trust signals */}
        <div
          className="flex flex-wrap items-center justify-center gap-6 mt-10 animate-fade-up"
          style={{ animationDelay: "0.5s" }}
        >
          {["900+ Community Members", "ID Verified Members", "No Booking Fees"].map((item) => (
            <div key={item} className="flex items-center gap-2 text-white/90 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>

        {/* Slide indicators */}
        <div className="flex gap-2 mt-8">
          {IMAGES.map((_, i) => (
            <button
              key={i}
              onClick={() => { setCurrent(i); setNext(null); setFading(false); }}
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{ backgroundColor: i === current ? "white" : "rgba(255,255,255,0.4)" }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
