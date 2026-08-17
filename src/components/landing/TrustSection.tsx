import { Users, ShieldCheck, Heart, PawPrint } from "lucide-react";

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
    icon: PawPrint,
    value: "Pets First",
    label: "Loved in their own home",
    sub: "No kennels, no stress — just home",
  },
  {
    icon: Heart,
    value: "Founded by",
    label: "2 girls who love pets & people",
    sub: "Built from lived nomadic experience",
  },
];

const TrustSection = () => {
  return (
    <section className="py-16 bg-primary">
      <div className="container">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-8 max-w-4xl mx-auto text-center">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-2 sm:gap-3">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/20 flex items-center justify-center">
                <stat.icon className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div>
                <p className="text-lg sm:text-2xl md:text-3xl font-display text-white leading-tight">{stat.value}</p>
                <p className="font-semibold text-white text-sm sm:text-base leading-tight">{stat.label}</p>
                <p className="text-xs sm:text-sm text-white/70 mt-0.5 leading-tight">{stat.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustSection;
