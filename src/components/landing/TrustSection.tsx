import { Users, ShieldCheck, Heart } from "lucide-react";

const stats = [
  {
    icon: Users,
    value: "900+",
    label: "Community Members",
    sub: "and growing every week",
  },
  {
    icon: ShieldCheck,
    value: "ID Verified",
    label: "Members",
    sub: "Onfido-powered identity checks",
  },
  {
    icon: Heart,
    value: "Founded by",
    label: "Travellers, for Travellers",
    sub: "Built from lived nomadic experience",
  },
];

const TrustSection = () => {
  return (
    <section className="py-16 bg-primary">
      <div className="container">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-8 max-w-4xl mx-auto text-center">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                <stat.icon className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-2xl md:text-3xl font-display text-white">{stat.value}</p>
                <p className="font-semibold text-white">{stat.label}</p>
                <p className="text-sm text-white/70 mt-0.5">{stat.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustSection;
