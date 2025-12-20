import { Shield, Eye, Star, Flag } from "lucide-react";

const TrustSection = () => {
  const trustFeatures = [
    {
      icon: Eye,
      title: "Profiles designed for clarity",
      description: "Not guessing — real info about who you're connecting with",
    },
    {
      icon: Shield,
      title: "In-app messaging",
      description: "Keeps everything in one place, safe and organized",
    },
    {
      icon: Star,
      title: "Verified reviews",
      description: "Reviews only after a sit is completed — honest feedback",
    },
    {
      icon: Flag,
      title: "Report & block tools",
      description: "Peace of mind with easy-to-use safety features",
    },
  ];

  return (
    <section className="py-20 bg-gradient-warm">
      <div className="container">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ocean-light text-secondary text-sm font-medium mb-4">
              <Shield className="w-4 h-4" />
              Safety First
            </div>
            <h2 className="text-3xl md:text-4xl font-display mb-4">
              Trust comes first
            </h2>
            <p className="text-muted-foreground">
              Built with safety and transparency at every step
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {trustFeatures.map((feature, index) => (
              <div
                key={index}
                className="flex items-start gap-4 p-6 rounded-xl bg-surface shadow-soft"
              >
                <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrustSection;
