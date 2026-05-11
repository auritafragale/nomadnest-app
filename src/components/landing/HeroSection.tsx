import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, MapPin } from "lucide-react";
import heroImage from "@/assets/hero-pets-home.jpg";
import whiteLogo from "@/assets/White_Logo.png";

const HeroSection = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/browse-sits${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}`);
  };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Happy traveller with pets"
          className="w-full h-full object-cover object-center"
        />
        {/* Coral gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/75 via-primary/65 to-foreground/80" />
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
          <div className="flex items-center bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 pl-4 text-muted-foreground flex-shrink-0">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <input
              type="text"
              placeholder="Where are you going?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
        </form>

        {/* Trust signals */}
        <div
          className="flex flex-wrap items-center justify-center gap-6 mt-10 animate-fade-up"
          style={{ animationDelay: "0.5s" }}
        >
          {[
            "900+ Community Members",
            "ID Verified Members",
            "No Booking Fees",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-white/90 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
