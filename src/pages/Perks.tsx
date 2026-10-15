import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, PawPrint, Plane } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { BackButton } from "@/components/layout/BackButton";
import { Skeleton } from "@/components/ui/skeleton";
import { NN_PAGE, RoleTheme, nnButton } from "@/components/nn/ui";
import {
  CommissionNote,
  CouponCard,
  LockedPerkCard,
  MemberCard,
  PerkLogo,
  PerkOfMonthCard,
  PetPerksSoon,
  PickedForSit,
} from "@/components/perks/PerkParts";
import {
  TRIP_MOMENTS,
  tripMomentOf,
  useMemberPerks,
  useMyNextSitForPerks,
  usePerkAccess,
  usePerkMemberCard,
  usePerksPreview,
  type TripMoment,
} from "@/hooks/usePerks";
import { isStoreApp } from "@/lib/storeApp";
import { cn } from "@/lib/utils";
import aboutJourney from "@/assets/about-journey.jpg";

const MOMENT_ICON: Record<TripMoment, LucideIcon> = { before: Plane, road: Briefcase, sit: PawPrint };

const GroupTitle = ({ moment }: { moment: TripMoment }) => {
  const m = TRIP_MOMENTS.find((x) => x.id === moment)!;
  const Icon = MOMENT_ICON[moment];
  return (
    <div id={`perks-${moment}`} className="flex scroll-mt-24 items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--nn-tint)]">
        <Icon className="h-5 w-5 text-[var(--nn-accent-dark)]" aria-hidden="true" />
      </span>
      <span className="flex flex-col gap-0.5">
        <h2 className="font-display text-[26px] font-normal leading-tight md:text-[26px] lg:text-[30px]">{m.label}</h2>
        <span className="text-sm text-muted-foreground">{m.intro}</span>
      </span>
    </div>
  );
};

const CARD_GRID = "grid items-start gap-3.5 md:grid-cols-2 lg:grid-cols-3 lg:gap-[18px]";

/** "Before you fly / On the road / At the sit": jump to each group. */
const JumpPills = ({ active, onJump, className }: { active: TripMoment; onJump: (m: TripMoment) => void; className?: string }) => (
  <nav aria-label="Jump to" className={className}>
    {TRIP_MOMENTS.map((m) => {
      const Icon = MOMENT_ICON[m.id];
      const on = m.id === active;
      return (
        <button
          key={m.id}
          type="button"
          aria-current={on ? "true" : undefined}
          onClick={() => onJump(m.id)}
          className={cn(
            "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px] md:text-sm",
            on ? "bg-foreground font-bold text-background" : "border-[1.5px] border-[var(--nn-border)] font-semibold",
          )}
        >
          <Icon className="hidden h-4 w-4 md:block" aria-hidden="true" />
          {m.label}
        </button>
      );
    })}
  </nav>
);

const PageTitle = ({ pills }: { pills?: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
    <div className="flex flex-col gap-1.5">
      <BackButton fallback="/dashboard" className="h-11 lg:hidden" />
      <h1 className="font-display text-[34px] font-normal leading-tight md:text-[40px] lg:text-[46px]">Member perks</h1>
      <p className="text-[16px] leading-normal text-muted-foreground">Deals from partners we use ourselves, for life on the road and at the sit.</p>
    </div>
    {pills}
  </div>
);

/** Member perks (design: PerksPhone, PerksTabletDark, PerksDesktop, and the Locked variants). */
const Perks = () => {
  const { signedIn, isMember, loading: accessLoading } = usePerkAccess();
  const [active, setActive] = useState<TripMoment>("before");

  // Members get the member list; everyone else only the preview. Signed-out
  // visitors never call a members-only function.
  const preview = usePerksPreview(!accessLoading && !isMember);
  const member = useMemberPerks(isMember);
  const nextSit = useMyNextSitForPerks(isMember);
  const card = usePerkMemberCard(isMember);

  const perks = useMemo(() => member.data ?? [], [member.data]);
  const byMoment = useMemo(() => {
    const g: Record<TripMoment, typeof perks> = { before: [], road: [], sit: [] };
    for (const p of perks) g[tripMomentOf(p.trip_moment)].push(p);
    return g;
  }, [perks]);
  const ofMonth = perks.find((p) => p.is_perk_of_month) ?? null;
  const picked = perks.filter((p) => p.picked_for_sits);

  const jump = (m: TripMoment) => {
    setActive(m);
    document.getElementById(`perks-${m}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const loading = accessLoading || (isMember ? member.isLoading : preview.isLoading);

  return (
    <RoleTheme role="sitter" className="flex min-h-screen flex-col">
      <Navbar wide />
      <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-[18px] pb-24 pt-20 md:gap-5 md:pt-24 lg:gap-[26px]")}>
        {loading ? (
          <>
            <PageTitle />
            <Skeleton className="h-[330px] w-full rounded-[24px]" />
            <div className={CARD_GRID}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-72 rounded-[22px]" />
              ))}
            </div>
          </>
        ) : isMember ? (
          <>
            <PageTitle pills={<JumpPills active={active} onJump={jump} className="hidden gap-2 lg:flex" />} />
            <div className={cn("grid gap-[18px] md:gap-4", ofMonth && "md:grid-cols-[1.35fr_1fr] lg:grid-cols-[2fr_1fr] lg:gap-[18px]")}>
              {ofMonth && <PerkOfMonthCard perk={ofMonth} className="order-2 md:order-1" />}
              <MemberCard
                className="order-1 md:order-2 md:h-full md:justify-between"
                firstName={card.data?.firstName ?? null}
                founding={!!card.data?.founding}
                perkCount={perks.length}
                usedCount={perks.filter((p) => p.used_by_me).length}
              />
            </div>
            {nextSit.data && picked.length > 0 && <PickedForSit sit={nextSit.data} perks={picked} />}
            <JumpPills active={active} onJump={jump} className="grid grid-cols-[1.15fr_1fr_0.9fr] gap-1.5 md:flex md:gap-2 lg:hidden" />
            {perks.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-[22px] border border-dashed border-[var(--nn-border)] p-8 text-center">
                <p className="text-[17px] font-bold">Partner perks are on the way</p>
                <p className="text-[15px] text-muted-foreground">We’re finalising deals with travel, insurance and pet care partners. Members will be the first to know.</p>
              </div>
            )}
            {perks.length > 0 &&
              TRIP_MOMENTS.map((m) => (
                <div key={m.id} className="flex flex-col gap-[18px]">
                  <GroupTitle moment={m.id} />
                  {byMoment[m.id].length > 0 ? (
                    <div className={CARD_GRID}>
                      {byMoment[m.id].map((p) => (
                        <CouponCard key={p.id} perk={p} />
                      ))}
                    </div>
                  ) : m.id === "sit" ? (
                    <PetPerksSoon />
                  ) : (
                    <p className="text-[15px] text-muted-foreground">New perks for this part of the trip are on the way.</p>
                  )}
                </div>
              ))}
            <CommissionNote />
          </>
        ) : (
          <LockedPerks perks={preview.data ?? []} signedIn={signedIn} />
        )}
      </main>
      <Footer />
    </RoleTheme>
  );
};

const listSentence = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Non-members and signed-out visitors: the preview only. */
const LockedPerks = ({ perks, signedIn }: { perks: { id: string; name: string; logo_url: string | null; category: string; trip_moment: string; sort_order: number }[]; signedIn: boolean }) => {
  const store = isStoreApp();
  const n = perks.length;
  const categories = [...new Set(perks.map((p) => p.category.toLowerCase()))];
  const groups = TRIP_MOMENTS.map((m) => ({ ...m, perks: perks.filter((p) => tripMomentOf(p.trip_moment) === m.id) })).filter((g) => g.perks.length > 0);

  return (
    <>
      <PageTitle />
      <div className="grid gap-[18px] lg:grid-cols-[1.4fr_1fr]">
        <section aria-label="Membership" className="flex flex-col gap-4 rounded-[24px] border border-[var(--nn-border)] bg-card p-[22px]">
          {n > 0 && (
            <div className="flex items-center">
              {perks.slice(0, 5).map((p, i) => (
                <span key={p.id} className={cn("flex rounded-2xl border-[3px] border-card", i > 0 && "-ml-2.5")}>
                  <PerkLogo name={p.name} logoUrl={p.logo_url} />
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-[28px] font-normal leading-tight">
              {n === 0 ? "Partner perks are on the way" : n === 1 ? "1 partner perk is waiting for you" : `${n} partner perks are waiting for you`}
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              {store
                ? "Perks are part of NomadNest membership, which is managed on nomadnest.global."
                : `${categories.length ? `Partner deals on ${listSentence(categories)}. ` : ""}Members get every link and code, and new perks arrive every month.`}
            </p>
          </div>
          {!store && (
            <div className="flex flex-col gap-2.5 md:flex-row lg:flex-col xl:flex-row">
              <Link to="/membership" className={nnButton("primary", "h-[52px] rounded-[14px] px-[22px] text-[16px] md:flex-1")}>
                See membership
              </Link>
              <Link
                to={signedIn ? "/membership#founding-code" : "/auth?return=%2Fmembership%23founding-code"}
                className={nnButton("secondary", "h-[52px] rounded-[14px] px-[18px] text-[15px] md:flex-1")}
              >
                Have a founding code? Redeem it
              </Link>
            </div>
          )}
        </section>
        <div
          aria-hidden="true"
          className="hidden min-h-[300px] rounded-[24px] bg-muted bg-cover bg-center lg:block"
          style={{ backgroundImage: `url(${aboutJourney})` }}
        />
      </div>
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-3 md:gap-3.5 lg:gap-[18px]">
          <GroupTitle moment={g.id} />
          <div className={CARD_GRID}>
            {g.perks.map((p) => (
              <LockedPerkCard key={p.id} perk={p} />
            ))}
          </div>
        </div>
      ))}
      <CommissionNote />
    </>
  );
};

export default Perks;
