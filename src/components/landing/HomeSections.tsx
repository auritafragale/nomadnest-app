import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgePercent, Check, IdCard, Lock, MapPin, Plane, Search, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCityPredictions } from "@/hooks/useCityPredictions";
import { formatCount, useFoundingSpots } from "@/hooks/useFoundingSpots";
import { shortRange } from "@/components/nn/ui";
import { cn } from "@/lib/utils";
import aboutJourney from "@/assets/about-journey.jpg";
import aboutHero from "@/assets/about-hero.jpg";
import petsHome from "@/assets/hero-pets-home.jpg";

/**
 * Home page sections (design: HomePhone, HomeTablet, HomeDesktop). Signed
 * out only. Real data only: the founding count comes from the database, the
 * open sits are real published listings (no owner details).
 */

const HERO = [1, 2, 3].map((n) => ({ webp: `/hero-${n}.webp`, jpg: `/hero-${n}.jpg` }));
const CTA = {
  nomad: "/auth?signup=true&role=sitter",
  parent: "/auth?signup=true&role=owner",
};

const HeroPhoto = ({ n, className, eager }: { n: number; className?: string; eager?: boolean }) => (
  <picture>
    <source srcSet={HERO[n].webp} type="image/webp" />
    <img
      src={HERO[n].jpg}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={className}
    />
  </picture>
);

/** "Where are you going?" with Places suggestions; goes to /browse-sits?q=. */
const HeroSearch = ({ onDark }: { onDark?: boolean }) => {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { predictions, clear } = useCityPredictions(q);
  const go = (value: string) => navigate(`/browse-sits${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(q);
      }}
      className="relative w-full max-w-xl"
    >
      <div className={cn("flex items-center overflow-hidden rounded-2xl bg-card shadow-lg", onDark ? "" : "border border-border")}>
        <MapPin className="ml-4 h-5 w-5 shrink-0 text-brand-coral-text" aria-hidden="true" />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="Where are you going?"
          aria-label="Where are you going?"
          autoComplete="off"
          className="h-14 min-w-0 flex-1 bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button type="submit" className="mr-1.5 flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground">
          <Search className="h-4 w-4" aria-hidden="true" />
          Search
        </button>
      </div>
      {open && predictions.length > 0 && (
        <ul className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover text-left text-popover-foreground shadow-2xl">
          {predictions.map((p) => (
            <li key={p.place_id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQ(p.description);
                  clear();
                  setOpen(false);
                  go(p.description);
                }}
                className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-left text-[15px] hover:bg-muted"
              >
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{p.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
};

/** Phone and tablet: crossfading full-bleed photos with dots. Desktop: a tilted three-photo collage. */
export const HomeHero = () => {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || paused) return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % HERO.length), 5500);
    return () => window.clearInterval(t);
  }, [paused]);

  const title = "Where travellers find homes and pets find care";
  const lead = "Free stays for Nomads. Loving care for pets. No booking fees, ever.";

  return (
    <>
      {/* Phone and tablet */}
      <section aria-label="Welcome" className="relative flex min-h-[600px] flex-col justify-end overflow-hidden bg-neutral-900 pt-16 lg:hidden md:min-h-[640px]">
        <div className="absolute inset-0" aria-hidden="true">
          {HERO.map((_, i) => (
            <div key={i} className={cn("absolute inset-0 transition-opacity duration-1000", i === slide ? "opacity-100" : "opacity-0")}>
              <HeroPhoto n={i} eager={i === 0} className="h-full w-full object-cover object-[center_30%]" />
            </div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/20" />
        </div>
        <div className="relative z-10 flex flex-col gap-4 px-5 pb-8 md:px-8 md:pb-12">
          <h1 className="max-w-2xl font-display text-[38px] leading-[1.05] text-white md:text-[52px]">{title}</h1>
          <p className="max-w-xl text-[16px] leading-snug text-white/95 md:text-[18px]">{lead}</p>
          <HeroSearch onDark />
          <div className="grid grid-cols-2 gap-2.5 sm:max-w-md">
            <Link to={CTA.nomad} className="flex h-[52px] items-center justify-center rounded-2xl bg-brand-coral text-[15px] font-bold text-primary-foreground">
              Join as a Nomad
            </Link>
            <Link to={CTA.parent} className="flex h-[52px] items-center justify-center rounded-2xl bg-card text-[15px] font-bold text-foreground">
              List your home
            </Link>
          </div>
          <div role="tablist" aria-label="Photos" className="-mb-2 flex gap-1">
            {HERO.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-label={`Photo ${i + 1} of ${HERO.length}`}
                aria-selected={i === slide}
                onClick={() => {
                  setSlide(i);
                  setPaused(true);
                }}
                className="flex h-11 w-11 items-center justify-center"
              >
                <span className={cn("h-2 rounded-full bg-white transition-all", i === slide ? "w-6" : "w-2 opacity-60")} />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Desktop */}
      <section aria-label="Welcome" className="hidden bg-background pt-16 lg:block">
        <div className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)_520px] items-center gap-12 px-6 py-16">
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-[60px] leading-[1.02]">{title}</h1>
            <p className="max-w-lg text-[19px] leading-snug text-muted-foreground">{lead}</p>
            <HeroSearch />
            <div className="flex gap-3">
              <Link to={CTA.nomad} className="flex h-[52px] items-center justify-center rounded-2xl bg-brand-coral px-7 text-[15px] font-bold text-primary-foreground">
                Join as a Nomad
              </Link>
              <Link
                to={CTA.parent}
                className="flex h-[52px] items-center justify-center rounded-2xl border-[1.5px] border-border px-7 text-[15px] font-bold"
              >
                List your home
              </Link>
            </div>
          </div>
          <div className="relative h-[520px]" aria-hidden="true">
            <div className="absolute left-[10px] top-[70px] h-[330px] w-[220px] -rotate-[5deg] overflow-hidden rounded-[26px] bg-[#D8C3B0] shadow-xl">
              <HeroPhoto n={0} eager className="h-full w-full object-cover object-[center_30%]" />
            </div>
            <div className="absolute left-[270px] top-[40px] h-[340px] w-[230px] rotate-[4deg] overflow-hidden rounded-[26px] bg-[#D8C3B0] shadow-xl">
              <HeroPhoto n={2} eager className="h-full w-full object-cover object-[center_25%]" />
            </div>
            <div className="absolute left-[150px] top-[230px] h-[270px] w-[210px] -rotate-1 overflow-hidden rounded-[26px] bg-[#D8C3B0] shadow-xl">
              <HeroPhoto n={1} eager className="h-full w-full object-cover object-[center_20%]" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

/** "[N] of [cap] founding spots left", from public_founding_spots(). Hidden until it loads. */
export const FoundingBanner = () => {
  const { data } = useFoundingSpots();
  if (!data || data.cap <= 0) return null;
  const taken = Math.max(0, data.cap - data.spotsLeft);
  return (
    <section aria-label="Founding Member phase" className="mx-auto w-full max-w-[1200px] px-5 md:px-8 lg:px-6">
      <div className="flex flex-col gap-2.5 rounded-[24px] border border-[#E8B53E]/60 bg-[var(--nn-tip-bg)] p-5 md:flex-row md:items-center md:gap-6">
        <span className="inline-flex h-8 w-fit items-center gap-1.5 rounded-full bg-[#E8B53E] px-3 text-[13px] font-bold text-[#3A2A06]">
          <Star className="h-3.5 w-3.5 fill-[#3A2A06]" aria-hidden="true" />
          Founding Member phase
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-[17px] font-bold">
            {formatCount(data.spotsLeft)} of {formatCount(data.cap)} founding spots left
          </p>
          <div
            className="h-2 overflow-hidden rounded-full bg-[#E8B53E]/30"
            role="progressbar"
            aria-label="Founding spots taken"
            aria-valuemin={0}
            aria-valuemax={data.cap}
            aria-valuenow={taken}
          >
            <div className="h-full rounded-full bg-[#E8B53E]" style={{ width: `${Math.min(100, (taken / data.cap) * 100)}%` }} />
          </div>
          <p className="text-[15px] text-muted-foreground">Founding Members join with an invite code and get free lifetime Combined membership.</p>
        </div>
      </div>
    </section>
  );
};

const STEPS = {
  nomad: [
    ["Create your profile", "Add photos, the pets you love and the dates you are free."],
    ["Find a sit and apply", "Browse homes worldwide, or get invited by Pet Parents."],
    ["Travel and care", "Stay for free and look after pets like your own."],
  ],
  parent: [
    ["List your home", "Tell us about your pets, your home and your dates."],
    ["Pick your Nomad", "Read profiles and reviews, then chat before you choose."],
    ["Travel with peace of mind", "Get daily photo updates while you are away."],
  ],
} as const;
const BENEFITS = {
  nomad: [
    "Stay in homes all over the world for free",
    "Spend time with pets who need you",
    "A friendly community of fellow Nomads",
    "Member perks: eSIM, insurance and luggage storage",
  ],
  parent: [
    "Pets stay happy in their own home",
    "ID-verified Nomads with real reviews",
    "Daily photo updates while you are away",
    "No booking fees, ever",
  ],
} as const;

/** One "How it works" with an I'm a Nomad / I'm a Pet Parent switch. */
export const HowItWorks = () => {
  const [role, setRole] = useState<"nomad" | "parent">("nomad");
  const nomad = role === "nomad";
  const pill = (r: "nomad" | "parent", label: string) => (
    <button
      type="button"
      aria-pressed={role === r}
      onClick={() => setRole(r)}
      className={cn(
        "flex h-11 items-center justify-center rounded-full px-4 text-[15px]",
        role === r ? (r === "nomad" ? "bg-brand-coral font-bold text-primary-foreground" : "bg-brand-teal font-bold text-primary-foreground") : "font-semibold text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="mx-auto flex w-full max-w-[1200px] scroll-mt-24 flex-col gap-5 px-5 md:px-8 lg:px-6">
      <h2 id="how-it-works-title" className="font-display text-[32px] leading-tight md:text-[38px]">How it works</h2>
      <div role="group" aria-label="Show steps for" className="grid w-full max-w-md grid-cols-2 gap-1 rounded-full bg-muted p-1">
        {pill("nomad", "I'm a Nomad")}
        {pill("parent", "I'm a Pet Parent")}
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS[role].map(([title, text], i) => (
          <li key={title} className="flex gap-3.5 rounded-[22px] border border-border bg-card p-5">
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-primary-foreground", nomad ? "bg-brand-coral" : "bg-brand-teal")}>
              {i + 1}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[17px] font-bold">{title}</span>
              <span className="text-[15px] leading-snug text-muted-foreground">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className={cn("grid overflow-hidden rounded-[22px] md:grid-cols-[300px_1fr] lg:grid-cols-[360px_1fr]", nomad ? "bg-brand-coral-light" : "bg-brand-teal-light")}>
        <img src={aboutJourney} alt="" loading="lazy" decoding="async" className="h-48 w-full object-cover md:h-full md:min-h-[260px]" />
        <div className="flex flex-col gap-3 p-5 md:p-7">
          <p className="font-display text-[24px] leading-tight">
            {nomad ? "For Nomads: explore the world, free" : "For Pet Parents: peace of mind, always"}
          </p>
          <ul className="flex flex-col gap-2">
            {BENEFITS[role].map((b) => (
              <li key={b} className="flex items-start gap-2 text-[15px]">
                <Check className={cn("mt-0.5 h-4 w-4 shrink-0", nomad ? "text-brand-coral-text" : "text-brand-teal-text")} aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
          <Link
            to={nomad ? CTA.nomad : CTA.parent}
            className={cn("mt-1 flex h-[52px] items-center justify-center rounded-2xl text-[15px] font-bold text-primary-foreground md:w-fit md:px-8", nomad ? "bg-brand-coral" : "bg-brand-teal")}
          >
            {nomad ? "Join as a Nomad" : "List your home"}
          </Link>
        </div>
      </div>
    </section>
  );
};

interface OpenSit {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  photo: string | null;
  start: string;
  end: string;
  pets: string;
}

const petSummary = (types: string[]) => {
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([t, n]) => {
      const word = t.toLowerCase();
      return `${n} ${n === 1 ? word : word.endsWith("s") ? word : `${word}s`}`;
    })
    .join(", ");
};

/**
 * Up to two real published listings with an open date. Only listing fields
 * that are public anyway (title, city, country, first photo, dates, pet
 * types); nothing about the owner.
 */
const useOpenSits = () =>
  useQuery({
    queryKey: ["home-open-sits"],
    queryFn: async (): Promise<OpenSit[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("listings")
        .select("id, title, city, country, photos, sit_dates!inner(start_date, end_date, status), pets(type)")
        .eq("status", "published")
        .eq("sit_dates.status", "open")
        .gte("sit_dates.start_date", today)
        .order("updated_at", { ascending: false })
        .limit(6);
      if (error) return [];
      return (data ?? [])
        .map((l) => {
          const dates = [...(l.sit_dates ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date));
          return {
            id: l.id,
            title: l.title,
            city: l.city,
            country: l.country,
            photo: l.photos?.[0] ?? null,
            start: dates[0]?.start_date,
            end: dates[0]?.end_date,
            pets: petSummary((l.pets ?? []).map((p) => p.type).filter(Boolean) as string[]),
          };
        })
        .filter((s) => !!s.start)
        .slice(0, 2) as OpenSit[];
    },
    staleTime: 5 * 60 * 1000,
  });

export const OpenSits = () => {
  const { data: sits = [] } = useOpenSits();
  if (sits.length === 0) return null;
  return (
    <section aria-labelledby="open-sits-title" className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 md:px-8 lg:px-6">
      <h2 id="open-sits-title" className="font-display text-[30px] leading-tight md:text-[34px]">Open sits right now</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {sits.map((s) => (
          <Link key={s.id} to={`/listing/${s.id}`} className="flex items-center gap-4 rounded-[22px] border border-border bg-card p-3">
            <span className="h-[96px] w-[112px] shrink-0 overflow-hidden rounded-2xl bg-[#CDB79E] md:h-[104px] md:w-[130px]">
              {s.photo && <img src={s.photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="line-clamp-2 text-[16px] font-bold leading-snug">{s.title}</span>
              <span className="text-[15px] text-muted-foreground">{[s.city, s.country].filter(Boolean).join(", ")}</span>
              <span className="text-[15px] font-semibold">{[shortRange(s.start, s.end), s.pets].filter(Boolean).join(" · ")}</span>
            </span>
          </Link>
        ))}
      </div>
      <Link to="/browse-sits" className="flex h-[52px] items-center justify-center rounded-2xl border-[1.5px] border-border text-[15px] font-bold md:w-fit md:px-8">
        See all sits
      </Link>
    </section>
  );
};

const WHY = [
  { icon: BadgePercent, title: "No booking fees", text: "One yearly membership. Nothing per sit." },
  { icon: Lock, title: "Private by design", text: "Your address stays hidden until a sit is confirmed." },
  { icon: IdCard, title: "ID-verified members", text: "Everyone who sits or hosts checks their ID first." },
  { icon: Plane, title: "Travel perks", text: "eSIM, insurance and luggage storage discounts." },
];

export const WhyNomadNest = () => (
  <section aria-labelledby="why-title" className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 md:px-8 lg:px-6">
    <h2 id="why-title" className="font-display text-[30px] leading-tight md:text-[34px]">Why NomadNest</h2>
    <div className="grid gap-4 lg:grid-cols-2">
      <img
        src={aboutHero}
        alt="A Nomad relaxing at home with a golden retriever"
        loading="lazy"
        decoding="async"
        className="h-56 w-full rounded-[22px] object-cover md:h-72 lg:h-full lg:min-h-[260px]"
      />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {WHY.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex flex-col gap-2 rounded-[22px] border border-border bg-card p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-coral-light text-brand-coral-text">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-[17px] font-bold">{title}</span>
            <span className="text-[15px] leading-snug text-muted-foreground">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

/** No names: the quote, who they are, and a link to /about. */
export const FoundersCard = () => (
  <section aria-label="The founders" className="mx-auto w-full max-w-[1200px] px-5 md:px-8 lg:px-6">
    <div className="flex flex-col gap-4 rounded-[26px] border border-border bg-card p-6 md:grid md:grid-cols-[200px_1fr] md:items-center md:gap-8 md:p-7">
      <div className="flex items-center gap-4 md:flex-col md:items-start">
        <div className="relative h-[72px] w-[116px] shrink-0 md:h-[120px] md:w-[200px]" aria-hidden="true">
          <img src="/hero-2-sm.webp" alt="" loading="lazy" className="absolute left-0 top-0 h-[72px] w-[72px] rounded-full border-4 border-card object-cover object-[center_20%] md:h-[120px] md:w-[120px]" />
          <img src="/hero-3-sm.webp" alt="" loading="lazy" className="absolute left-[44px] top-0 h-[72px] w-[72px] rounded-full border-4 border-card object-cover object-[center_25%] md:left-[80px] md:h-[120px] md:w-[120px]" />
        </div>
        <span className="flex flex-col md:hidden">
          <span className="text-[17px] font-bold">The founders</span>
          <span className="text-[15px] text-muted-foreground">Two girls who love pets and people</span>
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <span className="hidden flex-col md:flex">
          <span className="text-[17px] font-bold">The founders</span>
          <span className="text-[15px] text-muted-foreground">Two girls who love pets and people</span>
        </span>
        <p className="font-display text-[22px] leading-snug md:text-[26px]">
          “We started NomadNest because we wanted a sitting community that feels like friends looking after friends.”
        </p>
        <Link to="/about" className="inline-flex min-h-[44px] w-fit items-center text-[15px] font-bold text-brand-coral-text underline-offset-2 hover:underline">
          Read our story
        </Link>
      </div>
    </div>
  </section>
);

export const ReadyToStart = () => (
  <section aria-labelledby="ready-title" className="mx-auto w-full max-w-[1200px] px-5 md:px-8 lg:px-6">
    <div className="relative overflow-hidden rounded-[28px] bg-neutral-800">
      <img src={petsHome} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-[center_60%]" />
      <div className="absolute inset-0 bg-black/55" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-3 px-6 py-12 text-center md:py-16">
        <h2 id="ready-title" className="font-display text-[34px] leading-tight text-white md:text-[42px]">Ready to start?</h2>
        <p className="max-w-md text-[16px] text-white/95">Free to browse. Membership from £59 a year. No booking fees, ever.</p>
        <div className="mt-2 flex w-full max-w-md flex-col gap-2.5 sm:flex-row">
          <Link to="/auth?signup=true" className="flex h-[52px] w-full items-center justify-center rounded-2xl bg-brand-coral sm:flex-1 px-5 text-[15px] font-bold text-primary-foreground">
            Join NomadNest free
          </Link>
          <Link to="/membership" className="flex h-[52px] w-full items-center justify-center rounded-2xl bg-card sm:flex-1 px-5 text-[15px] font-bold text-foreground">
            See membership plans
          </Link>
        </div>
      </div>
    </div>
  </section>
);
