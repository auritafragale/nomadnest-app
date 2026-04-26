import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Globe, MessageCircle, Star, Shield } from "lucide-react";
import heroImage from "@/assets/hero-pets-home.jpg";

const HeroSection = () => {
  const trustFeatures = [
    { icon: Globe, label: "Worldwide" },
    { icon: MessageCircle, label: "Two-way profiles" },
    { icon: Shield, label: "Safe messaging" },
    { icon: Star, label: "Reviews after each sit" },
  ];

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-hero pt-16">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10 py-16 md:py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text content */}
          <div className="space-y-8 text-center lg:text-left">
            <h1 
              className="text-4xl md:text-5xl lg:text-6xl font-display leading-tight animate-fade-up"
              style={{ animationDelay: "0.1s" }}
            >
              Find Your Perfect House Sit.{" "}
              <span className="text-gradient-primary">Build Real Connections.</span>
            </h1>

            <p 
              className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 animate-fade-up"
              style={{ animationDelay: "0.2s" }}
            >
              NomadNest connects adventurous Nomads with Pet Parents who need trusted 
              home and pet care — no money, just community.
            </p>

            <div 
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 animate-fade-up"
              style={{ animationDelay: "0.3s" }}
            >
              <Link to="/auth?signup=true">
                <Button variant="hero" size="xl">
                  Create your profile
                </Button>
              </Link>
              <Link to="/browse-sits">
                <Button variant="hero-secondary" size="xl">
                  Browse sits
                </Button>
              </Link>
            </div>

            <div 
              className="flex flex-wrap items-center justify-center lg:justify-start gap-6 pt-4 animate-fade-up"
              style={{ animationDelay: "0.4s" }}
            >
              {trustFeatures.map((feature) => (
                <div 
                  key={feature.label}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <feature.icon className="w-4 h-4 text-secondary" />
                  <span>{feature.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hero Image */}
          <div
            className="relative hidden md:block animate-fade-up"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              <img 
                src={heroImage} 
                alt="Cozy living room with pets" 
                className="w-full h-auto object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent" />
            </div>
            <div className="absolute -bottom-4 -left-4 bg-surface rounded-xl p-4 shadow-xl animate-float">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
                  <Star className="w-6 h-6 text-success fill-success" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Trusted by 10k+</p>
                  <p className="text-xs text-muted-foreground">pet lovers worldwide</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;