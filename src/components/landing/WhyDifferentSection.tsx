import { BadgeDollarSign, MessageCircle, Gift, Crown } from "lucide-react";

const features = [
  {
    icon: BadgeDollarSign,
    title: "No Booking Fees",
    description: "Just one affordable yearly membership — no per-sit charges, no hidden costs. Stay and sit as much as you like.",
    color: "bg-terracotta-light",
    iconColor: "text-primary",
  },
  {
    icon: MessageCircle,
    title: "Community-Focused",
    description: "Direct member-to-member messaging, two-way profiles, and genuine reviews that build real trust.",
    color: "bg-ocean-light",
    iconColor: "text-secondary",
  },
  {
    icon: Gift,
    title: "Exclusive Travel Perks",
    description: "eSIM discounts, content insurance, luggage storage partnerships — benefits that make nomadic life easier.",
    color: "bg-sand-light",
    iconColor: "text-warning",
  },
  {
    icon: Crown,
    title: "Founding Member Phase",
    description: "Join now and lock in lifetime founding member benefits as we grow. Early members get the best deal — always.",
    color: "bg-sand-light",
    iconColor: "text-accent",
  },
];

const WhyDifferentSection = () => {
  return (
    <section className="py-12 bg-surface">
      <div className="container">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 rounded-full bg-sand-light text-warning text-sm font-semibold mb-4">
            What Makes Us Different
          </span>
          <h2 className="text-3xl md:text-4xl font-display mb-4">
            Built for the Modern Nomad
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            NomadNest isn't just another platform — it's a community designed around how real travellers live.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 max-w-6xl mx-auto">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group p-3 sm:p-6 rounded-xl sm:rounded-2xl border border-border bg-background hover:shadow-soft hover:-translate-y-1 transition-all duration-300"
            >
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl ${feature.color} flex items-center justify-center mb-3 sm:mb-5 group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${feature.iconColor}`} />
              </div>
              <h3 className="font-display text-sm sm:text-lg mb-1 sm:mb-2 leading-tight">{feature.title}</h3>
              <p className="text-muted-foreground text-[11px] sm:text-sm leading-relaxed line-clamp-3 sm:line-clamp-none">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyDifferentSection;
