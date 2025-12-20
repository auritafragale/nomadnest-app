import { Heart, Globe, CheckCircle, Home, Briefcase, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const ValuePropsSection = () => {
  const ownerBenefits = [
    { icon: Heart, text: "Find sitters who genuinely love animals" },
    { icon: Home, text: "Share your home with someone respectful and reliable" },
    { icon: CheckCircle, text: "Keep everything clear with routines, checklists, and messaging" },
  ];

  const sitterBenefits = [
    { icon: Briefcase, text: "Travel longer without paying for accommodation" },
    { icon: Globe, text: "Sit opportunities worldwide" },
    { icon: Star, text: "Build trust through reviews and a strong profile" },
  ];

  return (
    <section className="py-20 bg-gradient-warm">
      <div className="container">
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* For Pet Owners */}
          <Card variant="elevated" className="overflow-hidden">
            <div className="h-2 bg-primary" />
            <CardContent className="pt-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-terracotta-light text-primary text-sm font-medium mb-4">
                <Home className="w-4 h-4" />
                For Pet Owners
              </div>
              <h3 className="text-2xl font-display mb-6">
                Your pets deserve the best care
              </h3>
              <ul className="space-y-4">
                {ownerBenefits.map((benefit, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-terracotta-light flex items-center justify-center flex-shrink-0">
                      <benefit.icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-muted-foreground pt-1">{benefit.text}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* For Nomad Sitters */}
          <Card variant="elevated" className="overflow-hidden">
            <div className="h-2 bg-secondary" />
            <CardContent className="pt-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ocean-light text-secondary text-sm font-medium mb-4">
                <Globe className="w-4 h-4" />
                For Nomad Sitters
              </div>
              <h3 className="text-2xl font-display mb-6">
                Explore the world with purpose
              </h3>
              <ul className="space-y-4">
                {sitterBenefits.map((benefit, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-ocean-light flex items-center justify-center flex-shrink-0">
                      <benefit.icon className="w-4 h-4 text-secondary" />
                    </div>
                    <span className="text-muted-foreground pt-1">{benefit.text}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default ValuePropsSection;
