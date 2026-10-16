import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ChevronRight, Gift, Loader2, Map as MapIcon, Plane, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PerkLogo } from "@/components/perks/PerkParts";
import { nnButton } from "@/components/nn/ui";
import { openPerk, perkHeadline, tripMomentOf, useMemberPerks, usePerkAccess, usePerksPreview, type MemberPerk } from "@/hooks/usePerks";
import {
  countdownLabel,
  daysUntil,
  petNamesSentence,
  shortTitleFor,
  tripPassStore,
  type PerkPlacement,
} from "@/lib/perkPlacements";
import { isStoreApp } from "@/lib/storeApp";

/** Every placement says these are partner offers. */
export const PartnerOffersLabel = ({ className }: { className?: string }) => (
  <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full bg-muted px-2.5 text-[11px] font-bold tracking-[0.02em] text-foreground/80", className)}>
    Partner offers
  </span>
);

const useOpen = (placement: PerkPlacement) => {
  const [opening, setOpening] = useState<string | null>(null);
  const open = async (perk: MemberPerk) => {
    setOpening(perk.id);
    try {
      await openPerk(perk.slug, placement);
      return true;
    } catch {
      toast.error("We couldn't open this perk. Please try again in a moment.");
      return false;
    } finally {
      setOpening(null);
    }
  };
  return { opening, open };
};

const dayLabel = (iso: string) => format(parseISO(iso), "EEE d MMM");

// ── Trip pass ─────────────────────────────────────────────────────────────
/**
 * "YOUR TRIP PASS" (design: PerksSitConfirmedPhone, PerksSitUpcoming*): the
 * Nomad's own sit city, dates and pets, a countdown, and up to 3 "Before you
 * fly" perks. "Done" and hiding the pass are kept on this device, per sit.
 * Members only; nothing shows for anyone else.
 */
export const TripPass = ({
  sitId,
  city,
  country,
  startDate,
  endDate,
  today,
  petNames,
  placement,
  className,
}: {
  sitId: string;
  city: string | null;
  country: string | null;
  startDate: string;
  endDate: string;
  today: string;
  petNames: (string | null)[];
  placement: Extract<PerkPlacement, "sit_confirmed" | "sit_upcoming">;
  className?: string;
}) => {
  const { isMember } = usePerkAccess();
  const { data: perks = [] } = useMemberPerks(isMember);
  const [hidden, setHidden] = useState(() => tripPassStore.isHidden(sitId));
  const [done, setDone] = useState<string[]>(() => tripPassStore.done(sitId));
  const { opening, open } = useOpen(placement);

  useEffect(() => {
    setHidden(tripPassStore.isHidden(sitId));
    setDone(tripPassStore.done(sitId));
  }, [sitId]);

  const rows = perks
    .filter((p) => tripMomentOf(p.trip_moment) === "before")
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 3);
  const days = daysUntil(today, startDate);
  if (!isMember || hidden || rows.length === 0 || days < 0) return null;

  const ready = rows.filter((r) => done.includes(r.id)).length;
  const pets = petNamesSentence(petNames);
  const place = { city, country };
  const where = city || country || "Your sit";

  const get = async (perk: MemberPerk) => {
    if (await open(perk)) {
      tripPassStore.markDone(sitId, perk.id);
      setDone(tripPassStore.done(sitId));
    }
  };

  return (
    <section aria-label={`Your trip pass to ${where}`} className={cn("flex flex-col overflow-hidden rounded-[24px] border border-[var(--nn-border)] bg-card", className)}>
      <div
        className="relative flex flex-col gap-2.5 overflow-hidden px-[18px] pb-5 pt-[18px] text-[var(--nn-on-sunset)]"
        style={{ background: "linear-gradient(120deg, var(--nn-sunset-1) 0%, var(--nn-sunset-2) 50%, var(--nn-sunset-3) 100%)" }}
      >
        {/* The dotted flight path. */}
        <svg aria-hidden="true" width="170" height="70" viewBox="0 0 220 90" className="absolute right-2 top-2 opacity-30">
          <path d="M6 80 C 60 10, 150 10, 206 50" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 7" />
          <circle cx="6" cy="80" r="4" fill="currentColor" />
          <circle cx="206" cy="50" r="5" className="fill-[var(--nn-logo-bg)]" />
        </svg>
        <span aria-hidden="true" className="absolute -bottom-[90px] -right-[60px] h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle,hsl(0_0%_100%/0.45),transparent_70%)]" />
        <div className="relative flex items-center justify-between gap-2.5">
          <span className="text-[11px] font-extrabold tracking-[0.18em] text-[var(--nn-on-sunset-soft)]">YOUR TRIP PASS</span>
          <button
            type="button"
            aria-label="Hide the trip pass for this sit"
            onClick={() => {
              tripPassStore.hide(sitId);
              setHidden(true);
            }}
            className="-mr-3 -mt-3 flex h-11 w-11 items-center justify-center rounded-full"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
        <div className="relative flex flex-col gap-1">
          <span className="font-display text-[34px] leading-[1.05]">{where}</span>
          <span className="text-sm text-[var(--nn-on-sunset-soft)]">
            {dayLabel(startDate)} → {dayLabel(endDate)}
            {pets ? ` · ${pets}` : ""}
          </span>
        </div>
        <span className="relative inline-flex h-7 w-fit items-center gap-1.5 rounded-full bg-[var(--nn-logo-bg)] px-3 text-xs font-bold text-[var(--nn-on-sunset)] shadow-[0_2px_6px_rgba(58,26,15,0.18)]">
          <Plane className="h-3.5 w-3.5 text-[var(--nn-sunset-1)]" aria-hidden="true" />
          {countdownLabel(days)}
        </span>
      </div>
      <div className="h-3.5" />
      {/* The torn-ticket line. */}
      <div aria-hidden="true" className="relative mx-4 h-0 border-t-2 border-dashed border-[var(--nn-border)]">
        <span className="absolute -left-7 -top-3 h-[22px] w-[22px] rounded-full bg-background" />
        <span className="absolute -right-7 -top-3 h-[22px] w-[22px] rounded-full bg-background" />
      </div>
      <div className="flex flex-col gap-1.5 px-[18px] pb-4 pt-[18px]">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] font-bold">Before you fly</span>
            <span className="text-[13px] font-bold text-[var(--nn-teal-soft-text)]">
              {ready} of {rows.length} ready
            </span>
          </div>
          <span
            role="progressbar"
            aria-label="Before you fly"
            aria-valuemin={0}
            aria-valuemax={rows.length}
            aria-valuenow={ready}
            className="block h-2 rounded bg-muted"
          >
            <span className="block h-2 rounded bg-[hsl(var(--brand-teal))]" style={{ width: `${(ready / rows.length) * 100}%` }} />
          </span>
        </div>
        <ul className="flex flex-col">
          {rows.map((p, i) => {
            const isDone = done.includes(p.id);
            return (
              <li key={p.id} className={cn("flex items-center gap-3 py-3", i < rows.length - 1 && "border-b border-[var(--nn-border)]", isDone && "opacity-75")}>
                <PerkLogo name={p.name} logoUrl={p.logo_url} size={48} />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className={cn("text-[15px] font-bold", isDone && "line-through")}>{shortTitleFor(p, place)}</span>
                  {!isDone && <span className="font-display text-[22px] leading-[1.1] text-[var(--nn-accent-dark)]">{perkHeadline(p.benefit_headline)}</span>}
                  <span className="text-[13px] text-muted-foreground">{p.name}</span>
                </span>
                {isDone ? (
                  <span className="flex h-11 shrink-0 items-center whitespace-nowrap rounded-xl bg-[var(--nn-teal-soft)] px-3 text-sm font-bold text-[var(--nn-teal-soft-text)]">
                    ✓ Done
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => get(p)}
                    disabled={opening === p.id}
                    aria-label={`Get it: ${shortTitleFor(p, place)}, ${p.name}`}
                    className={nnButton("primary", "h-11 shrink-0 whitespace-nowrap rounded-xl px-4 text-sm")}
                  >
                    {opening === p.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Get it
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2.5 pt-1.5">
          <PartnerOffersLabel />
          <Link to="/perks" className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--nn-accent-dark)]">
            All your perks
          </Link>
        </div>
      </div>
    </section>
  );
};

// ── During the sit ────────────────────────────────────────────────────────
/** "Free time in {city}?" (design: PerksSitNowPhone, PerksSitNowTabletDark): up to 2 "On the road" perks. */
export const FreeTimePanel = ({ city, country, className }: { city: string | null; country: string | null; className?: string }) => {
  const { isMember } = usePerkAccess();
  const { data: perks = [] } = useMemberPerks(isMember);
  const { opening, open } = useOpen("sit_now");
  const rows = perks
    .filter((p) => tripMomentOf(p.trip_moment) === "road")
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 2);
  if (!isMember || rows.length === 0) return null;
  const where = city || country || "your city";
  return (
    <section aria-label={`In ${where}`} className={cn("flex flex-col gap-3 rounded-[22px] bg-[var(--nn-teal-soft)] p-4", className)}>
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex items-center gap-2">
          <MapIcon className="h-[18px] w-[18px] text-[var(--nn-teal-soft-text)]" aria-hidden="true" />
          <span className="text-[16px] font-bold">Free time in {where}?</span>
        </span>
        <PartnerOffersLabel className="bg-card" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {rows.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => open(p)}
            disabled={opening === p.id}
            className="flex min-w-0 flex-col gap-2.5 rounded-[18px] border border-[var(--nn-border)] bg-card p-3.5 text-left"
          >
            <span className="flex items-center justify-between gap-2">
              <PerkLogo name={p.name} logoUrl={p.logo_url} size={38} />
              <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-[var(--nn-tint)] px-2.5 text-[13px] font-bold text-[var(--nn-accent-dark)]">
                {perkHeadline(p.benefit_headline)}
              </span>
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold leading-snug">{shortTitleFor(p, { city, country })}</span>
              <span className="text-[13px] text-muted-foreground">{p.name}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

// ── Dashboards ────────────────────────────────────────────────────────────
/** "Your perks" (design: PerksDashPhone, PerksDashParentPhoneDark, PerksDashDesktopDark). Members only. */
export const PerksDashCard = ({ parentMode = false, className }: { parentMode?: boolean; className?: string }) => {
  const { isMember } = usePerkAccess();
  const { data: perks = [], isLoading } = useMemberPerks(isMember);
  const { open } = useOpen("dashboard");
  if (!isMember || isLoading || perks.length === 0) return null;
  const ofMonth = perks.find((p) => p.is_perk_of_month) ?? null;
  const used = perks.filter((p) => p.used_by_me).length;
  return (
    <section
      aria-label="Your perks"
      className={cn("relative flex flex-col gap-3.5 overflow-hidden rounded-[22px] p-[18px] text-[var(--nn-on-perk-gold)]", className)}
      style={{
        background: "linear-gradient(135deg, var(--nn-perk-gold-1) 0%, var(--nn-perk-gold-2) 50%, var(--nn-perk-gold-3) 100%)",
        boxShadow: "var(--nn-perk-gold-shadow)",
      }}
    >
      <span
        aria-hidden="true"
        className="absolute -right-[50px] -top-[70px] h-[190px] w-[190px] rounded-full"
        style={{ background: "radial-gradient(circle, var(--nn-perk-gold-glow), transparent 70%)" }}
      />
      <div className="relative flex items-center justify-between gap-2.5">
        <span className="flex flex-col gap-[3px]">
          <span className="font-display text-[24px] leading-[1.1]">{parentMode ? "Off on your own trip?" : "Your perks"}</span>
          <span className="text-sm text-[var(--nn-on-perk-gold-soft)]">
            {perks.length} partner {perks.length === 1 ? "perk" : "perks"}. {used} used so far.
          </span>
        </span>
        <Gift className="h-[26px] w-[26px] shrink-0" aria-hidden="true" />
      </div>
      {ofMonth && (
        <button
          type="button"
          onClick={() => open(ofMonth)}
          className="relative flex min-h-[64px] items-center gap-3 rounded-2xl bg-[var(--nn-logo-bg)] p-3 text-left text-[var(--nn-on-perk-gold)] shadow-[0_2px_8px_rgba(58,42,6,0.15)]"
        >
          <PerkLogo name={ofMonth.name} logoUrl={ofMonth.logo_url} size={42} />
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="inline-flex h-[22px] w-fit items-center gap-1 rounded-full bg-[var(--nn-on-perk-gold)] px-2 text-[11px] font-bold text-[var(--nn-perk-gold-1)]">
              <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
              Perk of the month
            </span>
            <span className="truncate text-[15px] font-bold">
              {perkHeadline(ofMonth.benefit_headline)}
              {ofMonth.benefit_subline ? ` ${ofMonth.benefit_subline}` : ""}
            </span>
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        </button>
      )}
      <div className="relative flex items-center justify-between gap-2.5">
        <Link
          to="/perks"
          className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--nn-on-perk-gold)] px-4 text-sm font-bold text-[var(--nn-logo-bg)]"
        >
          See all perks
        </Link>
        <span className="text-xs font-semibold text-[var(--nn-on-perk-gold-soft)]">Partner offers</span>
      </div>
    </section>
  );
};

// ── Membership (non-members) ──────────────────────────────────────────────
const PAYS_BACK = [
  "Member deals on travel insurance and eSIM data",
  "A VPN for safe Wi-Fi at every sit",
  "Tours and luggage storage in the city you sit in",
  "A new Perk of the month, every month",
];

/**
 * "Your membership pays you back" (design: PerksMembershipPhone): logos from
 * the public preview and fixed copy, no amounts. In the store apps: no link,
 * and the neutral line instead.
 */
export const MembershipPerksBlock = ({ className }: { className?: string }) => {
  const { data: preview = [] } = usePerksPreview(true);
  const store = isStoreApp();
  return (
    <section aria-label="Member perks" className={cn("flex flex-col gap-3 rounded-[22px] bg-[var(--nn-gold-soft)] p-[18px]", className)}>
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex">
          {preview.slice(0, 5).map((p, i) => (
            <span key={p.id} className={cn("flex rounded-[14px] border-2 border-[var(--nn-gold-soft)]", i > 0 && "-ml-2")}>
              <PerkLogo name={p.name} logoUrl={p.logo_url} size={40} />
            </span>
          ))}
        </span>
        <PartnerOffersLabel className="bg-card" />
      </div>
      <h2 className="font-display text-[22px] font-normal leading-tight">Your membership pays you back</h2>
      <ul className="flex flex-col gap-1.5">
        {PAYS_BACK.map((t) => (
          <li key={t} className="flex gap-2 text-sm leading-snug">
            <span className="font-bold text-[hsl(var(--brand-teal-text))]" aria-hidden="true">
              ✓
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
      {store ? (
        <p className="text-sm text-muted-foreground">Perks are part of NomadNest membership, which is managed on nomadnest.global.</p>
      ) : (
        <Link to="/perks" className="inline-flex min-h-11 w-fit items-center text-sm font-bold text-[var(--nn-gold-soft-link)]">
          Preview the perks
        </Link>
      )}
    </section>
  );
};

/** The note under the Trip pass on the Sit confirmed screen. */
export const CommissionLine = () => (
  <p className="text-xs leading-normal text-muted-foreground">Partner offers. NomadNest may earn a small commission, at no cost to you.</p>
);

