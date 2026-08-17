import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, Globe, Heart, Users, Shield, Wifi, Luggage, BadgeCheck } from "lucide-react";

const nomadBenefits = [
  { icon: Home, text: "Stay in beautiful homes worldwide" },
  { icon: Heart, text: "Care for adorable pets and make furry friends" },
  { icon: Users, text: "Connect with a global community of fellow nomads" },
  { icon: Wifi, text: "Exclusive perks: eSIM discounts, content insurance, luggage storage" },
];

const ownerBenefits = [
  { icon: BadgeCheck, text: "Find trusted, verified sitters you can rely on" },
  { icon: Shield, text: "No booking fees" },
  { icon: Heart, text: "Your pets stay happy and loved at home" },
  { icon: Users, text: "Join a caring, vetted community of travellers" },
];


const ValuePropsSection = () => {
  return (
    <section className="py-12 bg-background">
      <div className="container">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 rounded-full bg-terracotta-light text-primary text-sm font-semibold mb-4">
            Why NomadNest
          </span>
          <h2 className="text-3xl md:text-4xl font-display mb-4">
            Something for Everyone
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Whether you want to travel the world or find trusted care for your pets, NomadNest has you covered.
          </p>
        </div>

        <div className="flex md:grid md:grid-cols-2 gap-4 md:gap-6 lg:max-w-5xl mx-auto overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none pb-4 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 scroll-smooth">
          {/* For Nomads */}
          <div className="rounded-2xl overflow-hidden border border-border bg-surface shadow-soft snap-center shrink-0 w-[85vw] sm:w-[60vw] md:w-auto md:shrink">
            <div className="h-1.5 bg-primary" />
            <div className="p-4 sm:p-8">
              <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-terracotta-light text-primary text-xs sm:text-sm font-semibold mb-3 sm:mb-5">
                <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                For Nomads
              </div>
              <h3 className="text-lg sm:text-2xl font-display mb-1 sm:mb-2">Explore the World, Free</h3>
              <p className="text-muted-foreground text-xs sm:text-sm mb-4 sm:mb-6">
                Trade your skills and love of animals for free accommodation across the globe.
              </p>
              <ul className="space-y-2.5 sm:space-y-4 mb-5 sm:mb-8">
                {nomadBenefits.map((benefit, i) => (
                  <li key={i} className="flex items-start gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-terracotta-light flex items-center justify-center flex-shrink-0 mt-0.5">
                      <benefit.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                    </div>
                    <span className="text-xs sm:text-sm text-foreground leading-snug pt-1 sm:pt-1.5">{benefit.text}</span>
                  </li>
                ))}
              </ul>
              <Link to="/auth?signup=true&role=sitter">
                <Button className="w-full text-sm sm:text-base" size="lg">Become a Nomad</Button>
              </Link>
            </div>
          </div>

          {/* For Pet Parents */}
          <div className="rounded-2xl overflow-hidden border border-border bg-surface shadow-soft snap-center shrink-0 w-[85vw] sm:w-[60vw] md:w-auto md:shrink">
            <div className="h-1.5 bg-secondary" />
            <div className="p-4 sm:p-8">
              <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-ocean-light text-secondary text-xs sm:text-sm font-semibold mb-3 sm:mb-5">
                <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                For Pet Parents
              </div>
              <h3 className="text-lg sm:text-2xl font-display mb-1 sm:mb-2">Peace of Mind, Always</h3>
              <p className="text-muted-foreground text-xs sm:text-sm mb-4 sm:mb-6">
                Travel knowing your home and pets are in the hands of someone who truly cares.
              </p>
              <ul className="space-y-2.5 sm:space-y-4 mb-5 sm:mb-8">
                {ownerBenefits.map((benefit, i) => (
                  <li key={i} className="flex items-start gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-ocean-light flex items-center justify-center flex-shrink-0 mt-0.5">
                      <benefit.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-secondary" />
                    </div>
                    <span className="text-xs sm:text-sm text-foreground leading-snug pt-1 sm:pt-1.5">{benefit.text}</span>
                  </li>
                ))}
              </ul>
              <Link to="/auth?signup=true&role=owner">
                <Button variant="secondary" className="w-full text-sm sm:text-base" size="lg">List Your Home</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ValuePropsSection;
