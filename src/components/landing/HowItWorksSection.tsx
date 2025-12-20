import { User, FileText, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const HowItWorksSection = () => {
  const steps = [
    {
      icon: User,
      number: "01",
      title: "Create your profile",
      description:
        "Choose Pet Owner, Nomad Sitter, or Both. Add what matters so the right people find you.",
    },
    {
      icon: FileText,
      number: "02",
      title: "Post or apply",
      description:
        "Owners publish sits with dates and pet routines. Sitters search and apply (or get invited).",
    },
    {
      icon: MessageSquare,
      number: "03",
      title: "Chat, confirm, and go",
      description:
        "Message in-app, align expectations, confirm the sit — then enjoy a smooth handover.",
    },
  ];

  return (
    <section className="py-20 bg-surface">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-display mb-4">
            How NomadNest works
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Connect with trusted people worldwide in just a few steps
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <Card
              key={step.number}
              variant="feature"
              className="relative group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardContent className="pt-8 pb-6">
                {/* Step number */}
                <div className="absolute -top-4 left-6">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-glow">
                    {step.number}
                  </span>
                </div>

                {/* Icon */}
                <div className="w-14 h-14 rounded-xl bg-ocean-light flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <step.icon className="w-7 h-7 text-secondary" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-display mb-3">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
