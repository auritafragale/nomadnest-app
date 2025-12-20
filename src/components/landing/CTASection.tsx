import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-24 bg-surface relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
      </div>

      <div className="container relative z-10">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-display">
            Ready to find your next sit{" "}
            <span className="text-gradient-primary">(or your perfect sitter)?</span>
          </h2>
          
          <Link to="/auth?signup=true">
            <Button variant="hero" size="xl" className="group">
              Join NomadNest
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          
          <p className="text-sm text-muted-foreground">
            It's free to create a profile and explore.
          </p>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
