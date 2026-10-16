import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, ExternalLink, Gift, Loader2, Lock, MapPin, PawPrint, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nnButton, shortRange } from "@/components/nn/ui";
import aboutJourney from "@/assets/about-journey.jpg";
import { isOurPerkLogo } from "@/lib/perkPlacements";
import {
  getDiscountCode,
  openPerk,
  perkHeadline,
  type MemberPerk,
  type NextSitForPerks,
  type PerkPreview,
} from "@/hooks/usePerks";

/**
 * Partner logo on a white rounded tile with a light border, so it works in
 * light and dark. Only logos in our own perk-logos bucket are shown (never a
 * partner's website or a data: URL); otherwise the letter tile.
 */
export const PerkLogo = ({ name, logoUrl, size = 44 }: { name: string; logoUrl: string | null; size?: 36 | 38 | 40 | 42 | 44 | 48 }) => {
  const [failed, setFailed] = useState(false);
  const initials = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2) || name.slice(0, 2);
  const show = !failed && isOurPerkLogo(logoUrl, import.meta.env.VITE_SUPABASE_URL);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden border border-[var(--nn-logo-border)] bg-[var(--nn-logo-bg)] font-extrabold tracking-tight text-[var(--nn-logo-ink)]",
        size <= 38 ? "rounded-[11px] text-[13px]" : size <= 42 ? "rounded-xl text-sm" : "rounded-[14px] text-[16px]",
      )}
    >
      {show ? <img src={logoUrl!} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-contain p-1" /> : initials}
    </span>
  );
};

/** The dashed tear line with two notches, like a coupon. */
const Notch = () => (
  <div aria-hidden="true" className="relative mx-3.5 h-0 border-t-2 border-dashed border-[var(--nn-border)]">
    <span className="absolute -left-[26px] -top-3 h-[22px] w-[22px] rounded-full border-r border-[var(--nn-border)] bg-background" />
    <span className="absolute -right-[26px] -top-3 h-[22px] w-[22px] rounded-full border-l border-[var(--nn-border)] bg-background" />
  </div>
);

const useOpenPerk = () => {
  const [opening, setOpening] = useState(false);
  const open = async (slug: string) => {
    setOpening(true);
    try {
      await openPerk(slug);
    } catch {
      toast.error("We couldn't open this perk. Please try again in a moment.");
    } finally {
      setOpening(false);
    }
  };
  return { opening, open };
};

const GetPerkButton = ({ slug, className }: { slug: string; className?: string }) => {
  const { opening, open } = useOpenPerk();
  return (
    <button type="button" onClick={() => open(slug)} disabled={opening} className={nnButton("primary", cn("h-12 rounded-[14px] text-[15px]", className))}>
      {opening ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
      Get this perk
    </button>
  );
};

/** A member's coupon card: headline, how to use it, Reveal code, Get this perk. */
export const CouponCard = ({ perk }: { perk: MemberPerk }) => {
  const [code, setCode] = useState<string | null>(null);
  const [noCode, setNoCode] = useState(false);
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    setBusy(true);
    try {
      const value = await getDiscountCode(perk.slug);
      if (!value) {
        setNoCode(true);
        return;
      }
      setCode(value);
      await navigator.clipboard?.writeText(value).catch(() => undefined);
    } catch {
      toast.error("We couldn't get the code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article aria-label={perk.name} className="flex flex-col overflow-hidden rounded-[22px] border border-[var(--nn-border)] bg-card">
      <div className="flex flex-col gap-2.5 px-4 pb-3.5 pt-4">
        <div className="flex items-center gap-3">
          <PerkLogo name={perk.name} logoUrl={perk.logo_url} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[16px] font-bold">{perk.name}</span>
            <span className="text-[13px] text-muted-foreground">{perk.category}</span>
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[30px] leading-[1.05] text-[var(--nn-accent-dark)]">{perkHeadline(perk.benefit_headline)}</span>
          {perk.benefit_subline && <span className="text-[15px] font-semibold">{perk.benefit_subline}</span>}
        </div>
        {perk.description && <p className="line-clamp-3 whitespace-pre-line text-sm leading-normal text-muted-foreground">{perk.description}</p>}
        {perk.terms && <p className="text-xs text-muted-foreground">{perk.terms}</p>}
      </div>
      <Notch />
      <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3.5">
        {perk.has_code && code ? (
          <>
            <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-[hsl(var(--brand-teal))] bg-[var(--nn-pick-bg)] pl-3.5 pr-2">
              <span className="min-w-0 flex-1 truncate font-mono text-lg font-bold tracking-[0.08em]">{code}</span>
              <span className="flex h-10 items-center gap-1.5 rounded-[10px] bg-[hsl(var(--brand-teal))] px-3 text-sm font-bold text-primary-foreground">
                <Check className="h-4 w-4" aria-hidden="true" />
                Copied
              </span>
            </div>
            <span role="status" className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--nn-pick-text)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--nn-gold)]" aria-hidden="true" />
              Paste it at checkout on the partner’s site.
            </span>
          </>
        ) : perk.has_code && !noCode ? (
          <button
            type="button"
            onClick={reveal}
            disabled={busy}
            className="flex h-12 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[var(--nn-border)] px-3.5 text-[15px] font-bold disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
            Reveal code
          </button>
        ) : (
          <span className="text-[13px] text-muted-foreground">No code needed. The member price is applied through the link.</span>
        )}
        <GetPerkButton slug={perk.slug} />
      </div>
    </article>
  );
};

/** What non-members see: name, category and blurred bars; nothing from the member list. */
export const LockedPerkCard = ({ perk }: { perk: PerkPreview }) => (
  <article aria-label={`${perk.name}, for members`} className="flex flex-col overflow-hidden rounded-[22px] border border-[var(--nn-border)] bg-card">
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <PerkLogo name={perk.name} logoUrl={perk.logo_url} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-bold">{perk.name}</span>
          <span className="text-[13px] text-muted-foreground">{perk.category}</span>
        </span>
        <Lock className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
      </div>
      <div aria-hidden="true">
        <span className="block h-6 w-[70%] rounded-lg bg-[var(--nn-tint)] blur-[5px]" />
        <span className="mt-2 block h-3.5 w-[55%] rounded-md bg-muted blur-[4px]" />
        <span className="mt-2.5 block h-3 w-[85%] rounded-md bg-muted blur-[4px]" />
      </div>
    </div>
    <Notch />
    <div className="flex items-center gap-2 px-4 pb-3.5 pt-3 text-[13px] font-semibold text-muted-foreground">
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      Link and code unlock with membership
    </div>
  </article>
);

/** The gold pill of the Founding badge and the Perk of the month. */
const GoldPill = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--nn-gold)] px-3 text-xs font-bold text-[var(--nn-gold-text)]", className)}>{children}</span>
);

export const PerkOfMonthCard = ({ perk, className }: { perk: MemberPerk; className?: string }) => {
  const headline = perkHeadline(perk.benefit_headline);
  return (
    <section
      aria-label="Perk of the month"
      className={cn("relative flex h-[330px] flex-col justify-end overflow-hidden rounded-[24px] bg-muted bg-cover lg:h-[340px]", className)}
      style={{ backgroundImage: `url(${aboutJourney})`, backgroundPosition: "center 40%" }}
    >
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/5 from-20% to-black/85" />
      <GoldPill className="absolute left-4 top-4 h-[30px]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Perk of the month
      </GoldPill>
      <div className="relative flex flex-col gap-3 p-[18px] lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="flex flex-col gap-1.5 text-[var(--nn-ink-text)]">
          <span className="flex items-center gap-2.5">
            <PerkLogo name={perk.name} logoUrl={perk.logo_url} size={36} />
            <span className="text-[15px] font-bold">{perk.name}</span>
          </span>
          <span className="font-display text-[32px] leading-[1.05] lg:text-[38px]">
            {headline}
            {perk.benefit_subline ? ` ${perk.benefit_subline}` : ""}
          </span>
          {perk.spotlight_text && <span className="text-sm text-[var(--nn-ink-muted)]">{perk.spotlight_text}</span>}
        </div>
        <GetPerkButton slug={perk.slug} className="h-[50px] shrink-0 px-5" />
      </div>
    </section>
  );
};

/** The member's own card: first name only, the gold badge only for Founding members. */
export const MemberCard = ({
  firstName,
  founding,
  perkCount,
  usedCount,
  className,
}: {
  firstName: string | null;
  founding: boolean;
  perkCount: number;
  usedCount: number | null;
  className?: string;
}) => (
  <section
    aria-label="Your membership"
    className={cn("relative flex flex-col gap-3.5 overflow-hidden rounded-[24px] bg-[var(--nn-ink)] p-5 text-[var(--nn-ink-text)]", className)}
  >
    <span aria-hidden="true" className="absolute -right-10 -top-[60px] h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle,hsl(var(--brand-coral)/0.55),transparent_70%)]" />
    <span aria-hidden="true" className="absolute -bottom-20 -left-[50px] h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle,hsl(var(--brand-teal)/0.45),transparent_70%)]" />
    <div className="relative flex min-h-7 items-center justify-between gap-2.5">
      {founding ? (
        <GoldPill>
          <Star className="h-3 w-3 fill-current" aria-hidden="true" />
          Founding member
        </GoldPill>
      ) : (
        <span />
      )}
      <Gift className="h-[22px] w-[22px]" aria-hidden="true" />
    </div>
    <div className="relative flex flex-col gap-1">
      <span className="text-xl font-bold">{firstName ? `${firstName}’s perks` : "Your perks"}</span>
      <span className="text-sm leading-normal text-[var(--nn-ink-muted)]">Every partner link and code, included with your membership.</span>
    </div>
    <div className="relative flex gap-[26px]">
      <Stat value={String(perkCount)} label={perkCount === 1 ? "partner perk" : "partner perks"} />
      {usedCount !== null ? <Stat value={String(usedCount)} label="used so far" /> : <Stat value="3" label="trip moments" />}
      <Stat value="New" label="every month" />
    </div>
  </section>
);

const Stat = ({ value, label }: { value: string; label: string }) => (
  <span className="flex flex-col gap-0.5">
    <span className="font-display text-[28px] leading-none">{value}</span>
    <span className="text-xs text-[var(--nn-ink-muted)]">{label}</span>
  </span>
);

/** "Picked for your next sit": only the member's own next sit (city and dates). */
export const PickedForSit = ({ sit, perks }: { sit: NextSitForPerks; perks: MemberPerk[] }) => {
  const { open } = useOpenPerk();
  const place = [sit.city, sit.country].filter(Boolean).join(", ");
  const dates = sit.start_date && sit.end_date ? shortRange(sit.start_date, sit.end_date) : null;
  return (
    <section aria-label="Picked for your next sit" className="flex flex-col gap-3 rounded-[22px] bg-[var(--nn-pick-bg)] p-4">
      <div className="flex items-center gap-2.5">
        <MapPin className="h-[18px] w-[18px] text-[var(--nn-pick-text)]" aria-hidden="true" />
        <span className="flex flex-col gap-0.5">
          <span className="text-[16px] font-bold">Picked for your next sit</span>
          {(place || dates) && <span className="text-[13px] text-foreground/85">{[place, dates].filter(Boolean).join(" · ")}</span>}
        </span>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        {perks.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => open(p.slug)}
            className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-[var(--nn-border)] bg-card p-3 text-left"
          >
            <PerkLogo name={p.name} logoUrl={p.logo_url} size={40} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-bold">{p.name}</span>
              <span className="truncate text-[13px] text-muted-foreground">
                {perkHeadline(p.benefit_headline)}
                {p.benefit_subline ? ` · ${p.benefit_subline}` : ""}
              </span>
            </span>
            <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
};

/** The empty "At the sit" group. The suggestion goes through the Contact form. */
export const PetPerksSoon = () => (
  <section className="flex flex-col items-start gap-2.5 rounded-[22px] border-[1.5px] border-dashed border-[var(--nn-border)] p-[18px]">
    <span className="flex items-center gap-2">
      <PawPrint className="h-5 w-5 text-[var(--nn-accent-dark)]" aria-hidden="true" />
      <span className="text-[16px] font-bold">Pet perks are on the way</span>
    </span>
    <span className="text-sm leading-normal text-muted-foreground">
      We’re talking to pet insurance, food and supplies partners. Which brands would you love to see here?
    </span>
    <Link to="/contact?topic=partnership" className={nnButton("secondary", "h-11 rounded-[14px] px-4 text-sm")}>
      Suggest a partner
    </Link>
  </section>
);

export const CommissionNote = () => (
  <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
    Some partner links earn NomadNest a small commission at no extra cost to you. It helps keep membership fees low and NomadNest free of booking
    fees.
  </p>
);
