import { UserPlus, MessageCircle, Globe } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    number: "01",
    title: "Create Your Profile",
    description: "Sign up as a Nomad, a Pet Parent, or both. Add your story, photos, and what makes you trustworthy.",
  },
  {
    icon: MessageCircle,
    number: "02",
    title: "Connect & Apply",
    description: "Browse sits worldwide or find trusted sitters. Message directly and align expectations before committing.",
  },
  {
    icon: Globe,
    number: "03",
    title: "Travel & Care",
    description: "Experience beautiful homes worldwide or enjoy peace of mind knowing your pets are loved at home.",
  },
];

const HowItWorksSection = () => {
  return (
    <section className="py-20 bg-surface">
      <div className="container">
        <div className="text-center mb-14">
          <span className="inline-block px-4 py-1.5 rounded-full bg-terracotta-light text-primary text-sm font-semibold mb-4">
            Simple &amp; Free
          </span>
          <h2 className="text-3xl md:text-4xl font-display mb-4">How NomadNest Works</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Connect with trusted people worldwide in three simple steps
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-10 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-border z-0" />

          {steps.map((step, index) => (
            <div key={step.number} className="relative flex flex-col items-center text-center group">
              {/* Step bubble */}
              <div className="relative z-10 w-20 h-20 rounded-full bg-primary flex items-center justify-center mb-6 shadow-glow-primary group-hover:scale-110 transition-transform duration-300">
                <step.icon className="w-8 h-8 text-white" />
                <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center">
                  {index + 1}
                </span>
              </div>
              <h3 className="text-xl font-display mb-3">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
