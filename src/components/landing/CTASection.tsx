import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Crown, ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/8 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/8 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
      </div>

      <div className="container relative z-10">
        <div className="max-w-2xl mx-auto text-center">
          {/* Founding badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sand-light text-warning font-semibold text-sm mb-6">
            <Crown className="w-4 h-4 text-accent" />
            Founding Member Phase — Limited Spots
          </div>

          <h2 className="text-3xl md:text-5xl font-display mb-4 leading-tight">
            Ready to Start Your{" "}
            <span className="text-gradient-primary">NomadNest Adventure?</span>
          </h2>

          <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto">
            Join 900+ members already travelling smarter, connecting deeper, and living more freely.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/auth?signup=true">
              <Button variant="hero" size="xl" className="group w-full sm:w-auto">
                Join NomadNest Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/membership">
              <Button variant="hero-secondary" size="xl" className="w-full sm:w-auto">
                View Membership Plans
              </Button>
            </Link>
          </div>

          <p className="text-xs text-muted-foreground mt-5">
            Free to browse. Membership from £59/year. No booking fees — ever.
          </p>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
