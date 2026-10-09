import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { NN_PAGE, RoleTheme, nnButton } from "@/components/nn/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { useMembership, MEMBERSHIP_PLANS, type PlanId } from "@/hooks/useMembership";
import { formatCount, useFoundingSpots } from "@/hooks/useFoundingSpots";
import { REDEEM_MESSAGES } from "@/lib/foundingCode";
import { cn } from "@/lib/utils";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

const FAQS: [string, string][] = [
  ["Is there a booking fee?", "No. Your yearly membership is the only cost. Nomads stay for free and Pet Parents get free pet care."],
  [
    "Why is there a membership?",
    "No money ever changes hands between members: free stays for free pet care. The membership pays for running NomadNest, ID checks and support, not for the sit itself.",
  ],
  ["Can I cancel?", "Yes, any time from Manage billing and receipts. You keep your membership until the end of the year you paid for."],
  ["Why do I need an ID check?", "Everyone who sits or lists a home checks their ID once. Your documents are only used to confirm it is you, and nobody else ever sees them."],
  ["What happens to my reviews if I stop?", "They stay on your profile, so you can pick up where you left off."],
];

const PLAN_ORDER: PlanId[] = ["sitter", "owner", "combined"];
const PLAN_TONE: Record<PlanId, string> = {
  sitter: "border-brand-coral",
  owner: "border-brand-teal",
  combined: "border-[var(--nn-tip-border)]",
};

/** /membership: one yearly membership, plans, founding codes, perks, questions. */
const Membership = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { activeRole } = useActiveRole();
  const m = useMembership();
  const { data: founding } = useFoundingSpots();
  const [plan, setPlan] = useState<PlanId>("combined");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const isFounding = m.foundingMember;
  const isProblem = !isFounding && m.status === "past_due";
  const isMember = !isFounding && !isProblem && m.subscribed;
  const isEnding = isMember && m.cancelAtPeriodEnd;
  const current = isMember ? m.membershipType : null;

  // Back from Stripe (same tab).
  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const portal = searchParams.get("portal");
    const legacyCancelled = searchParams.get("cancelled");
    if (!checkout && !portal && !legacyCancelled) return;
    if (checkout === "success") toast.success("Thank you! Your membership is active. It can take a minute to show here.");
    if (checkout === "cancelled" || legacyCancelled) toast("Payment cancelled. Nothing was charged. You can try again whenever you're ready.");
    if (portal) m.checkSubscription();
    if (checkout === "success") setTimeout(() => m.checkSubscription(), 4000);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default choice: Combined, or (for a one-side member) Combined as the upgrade.
  useEffect(() => {
    if (current && plan === current) setPlan(current === "combined" ? "sitter" : "combined");
  }, [current, plan]);

  const choose = async () => {
    if (!user) {
      navigate("/auth?signup=true");
      return;
    }
    setBusy(true);
    try {
      const res = await m.startCheckout(plan);
      if (res.kind === "updated") toast.success(`You're now on ${MEMBERSHIP_PLANS[plan].short}. We credited what was left of your old plan.`);
      if (res.kind === "scheduled") toast.success(`Your plan changes to ${MEMBERSHIP_PLANS[plan].short} on ${fmt(res.effective) ?? "your renewal date"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const keepMembership = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await m.startCheckout(current);
      toast.success("Your membership will renew as usual.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const portal = async (updateCard = false) => {
    try {
      await m.openPortal(updateCard);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't open billing just now.");
    }
  };

  const redeem = async () => {
    if (!user) {
      navigate("/auth?signup=true");
      return;
    }
    if (!code.trim()) return toast.error("Enter your code first.");
    setRedeeming(true);
    try {
      const res = await m.redeemFoundingMemberCode(code);
      if (res.result === "ok") {
        setCode("");
        toast.success(
          res.refundedPence
            ? `Welcome, Founding member! Combined is yours for life. We cancelled your paid plan and refunded £${(res.refundedPence / 100).toFixed(2)}.`
            : res.refundPending
              ? "Welcome, Founding member! Combined is yours for life. We cancelled your paid plan and will refund what was left within a few days."
              : "Welcome, Founding member! Combined is yours for life.",
        );
      } else {
        toast.error(REDEEM_MESSAGES[res.result]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't redeem that code just now.");
    } finally {
      setRedeeming(false);
    }
  };

  const plans = PLAN_ORDER.filter((p) => p !== current);
  const showPlans = !isFounding && !isProblem;
  const ctaLabel = !user ? "Create my account" : current ? `Switch to ${MEMBERSHIP_PLANS[plan].short}` : `Continue with ${MEMBERSHIP_PLANS[plan].short}`;
  const card = m.cardBrand && m.cardLast4 ? `${m.cardBrand.charAt(0).toUpperCase()}${m.cardBrand.slice(1)} ending ${m.cardLast4}` : null;

  return (
    <RoleTheme role={activeRole === "owner" ? "owner" : "sitter"} className="flex min-h-screen flex-col">
      <Navbar wide />
      <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-5 pb-24 pt-20 md:pt-24")}>
        <div className="flex flex-col gap-1">
          <Link to={user ? "/dashboard" : "/"} className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-muted-foreground">
            ← {user ? "Dashboard" : "Home"}
          </Link>
          <h1 className="font-display text-[32px] font-normal leading-tight lg:text-[38px]">Membership</h1>
          <p className="max-w-2xl text-[15px] text-muted-foreground">
            One yearly membership. No booking fees, ever. Free stays for Nomads, free pet care for Pet Parents.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            {user && m.loading && <Skeleton className="h-32 rounded-[22px]" />}

            {isFounding && (
              <section aria-label="Your membership" className="rounded-[22px] border-[1.5px] border-[var(--nn-tip-border)] bg-card p-5">
                <span className="inline-flex rounded-full bg-[#E8B53E] px-2.5 py-1 text-xs font-bold text-[#3A2A06]">★ Founding member</span>
                <p className="mt-3 font-display text-2xl">Combined, for life</p>
                <p className="mt-1 text-[15px] text-muted-foreground">
                  You are one of the first 1,000 members. Nomad and Pet Parent, no renewals, nothing to pay. Thank you for building NomadNest with us.
                </p>
              </section>
            )}

            {isMember && current && (
              <section aria-label="Your membership" className="flex flex-col gap-3 rounded-[22px] border border-[var(--nn-border)] bg-card p-5">
                <p className="flex flex-wrap items-center gap-2 text-[17px] font-bold">
                  {MEMBERSHIP_PLANS[current].short} membership
                  {isEnding ? (
                    <span className="rounded-full bg-[var(--nn-tip-bg)] px-2.5 py-1 text-xs font-bold text-[var(--nn-tip-text)]">Ending</span>
                  ) : (
                    <span className="rounded-full bg-[var(--nn-ok-bg)] px-2.5 py-1 text-xs font-bold text-brand-teal-text">✓ Active</span>
                  )}
                </p>
                {isEnding ? (
                  <p className="text-[15px]">
                    Your membership ends on {fmt(m.subscriptionEnd) ?? "the end of your year"}. Your profile, reviews and listing stay, so you can come back any time.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {[`${MEMBERSHIP_PLANS[current].price} a year`, m.subscriptionEnd && `renews on ${fmt(m.subscriptionEnd)}`, card].filter(Boolean).join(" · ")}
                  </p>
                )}
                {m.pendingPlan && !isEnding && (
                  <p className="rounded-2xl bg-muted p-3 text-sm">
                    Your plan changes to {MEMBERSHIP_PLANS[m.pendingPlan].short} on {fmt(m.subscriptionEnd) ?? "your renewal date"}.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {isEnding && (
                    <button type="button" onClick={keepMembership} disabled={busy} className={nnButton("primary")}>
                      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Keep my membership
                    </button>
                  )}
                  <button type="button" onClick={() => portal()} className={nnButton("secondary")}>
                    Manage billing and receipts
                  </button>
                </div>
                {current !== "combined" && !isEnding && (
                  <div className="rounded-2xl bg-[var(--nn-soft)] p-4">
                    <p className="text-[15px] font-bold">{current === "sitter" ? "Want to list your home too?" : "Want to go sitting too?"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Switch to Combined for £99 a year. We credit what is left of your {MEMBERSHIP_PLANS[current].short} plan, so you never pay twice.
                    </p>
                    <button type="button" onClick={() => setPlan("combined")} className={nnButton("secondary", "mt-3")}>
                      Switch to Combined
                    </button>
                  </div>
                )}
              </section>
            )}

            {isProblem && (
              <section role="alert" className="flex flex-col gap-2 rounded-[22px] border-[1.5px] border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] p-5 text-[var(--nn-tip-text)]">
                <p className="text-[17px] font-bold">Your last payment didn't go through</p>
                <p className="text-[15px]">
                  {m.paymentFailedAt ? `We tried on ${fmt(m.paymentFailedAt)}. ` : ""}Please update your card to keep your{" "}
                  {m.membershipType ? MEMBERSHIP_PLANS[m.membershipType].short : ""} membership. Your listing and confirmed sits stay as they are until then.
                </p>
                <button type="button" onClick={() => portal(true)} className={nnButton("primary", "self-start")}>
                  Update my card
                </button>
              </section>
            )}

            {showPlans && (
              <section aria-labelledby="plans-title" className="flex flex-col gap-3">
                <h2 id="plans-title" className="font-display text-2xl font-normal">
                  {current ? "Change your plan" : "Choose your membership"}
                </h2>
                <div role="radiogroup" aria-labelledby="plans-title" className="grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {plans.map((id) => {
                    const p = MEMBERSHIP_PLANS[id];
                    const on = plan === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setPlan(id)}
                        className={cn(
                          "flex flex-col gap-2 rounded-[22px] border-[1.5px] bg-card p-4 text-left transition-colors",
                          on ? PLAN_TONE[id] : "border-[var(--nn-border)]",
                        )}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span>
                            <span className="block text-[17px] font-bold">{p.short}</span>
                            <span className="block text-sm text-muted-foreground">{p.who}</span>
                          </span>
                          <span className="text-right">
                            <span className="block text-xl font-bold">{p.price}</span>
                            <span className="block text-xs text-muted-foreground">a year</span>
                          </span>
                        </span>
                        {id === "combined" && (
                          <span className="self-start rounded-full bg-[#E8B53E] px-2.5 py-1 text-xs font-bold text-[#3A2A06]">Best value · save £19</span>
                        )}
                        <ul className="flex flex-col gap-1.5">
                          {p.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-sm">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal-text" aria-hidden="true" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={choose} disabled={busy || (!!user && m.loading)} className={nnButton("primary", "h-12 w-full md:w-auto md:self-start md:px-10")}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {ctaLabel}
                </button>
                <p className="text-sm text-muted-foreground">Secure payment with Stripe. Cancel any time in a couple of taps.</p>
              </section>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {!isFounding && !isProblem && (
              <section aria-labelledby="founding-title" className="flex flex-col gap-2 rounded-[22px] border border-[var(--nn-border)] bg-[var(--nn-soft)] p-5">
                <p id="founding-title" className="flex flex-wrap items-center justify-between gap-2 text-[15px] font-bold">
                  Have a founding invite code?
                  {founding && <span className="rounded-full bg-[#E8B53E] px-2.5 py-1 text-xs font-bold text-[#3A2A06]">{formatCount(founding.spotsLeft)} of 1,000 left</span>}
                </p>
                <p className="text-sm text-muted-foreground">Founding members get Combined membership for life. Codes are shared by the founders and early members.</p>
                <label htmlFor="founding-code" className="text-sm font-semibold">Enter your code</label>
                <div className="flex gap-2">
                  <input
                    id="founding-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                    className="min-h-[44px] min-w-0 flex-1 rounded-xl border-[1.5px] border-[var(--nn-border)] bg-card px-3 text-[16px] uppercase outline-none focus:border-[var(--nn-accent)]"
                  />
                  <button type="button" onClick={redeem} disabled={redeeming} className={nnButton("secondary")}>
                    {redeeming && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Redeem
                  </button>
                </div>
                {isMember && <p className="text-sm text-muted-foreground">If you redeem a code, we cancel your paid plan and refund what is left.</p>}
              </section>
            )}

            <Link to="/perks" className="flex min-h-[64px] items-center gap-3 rounded-[22px] border border-[var(--nn-border)] bg-card p-4">
              <span className="text-2xl" aria-hidden="true">🎁</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">Member perks</span>
                <span className="block text-sm text-muted-foreground">Travel insurance, eSIMs, pet care and more</span>
              </span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </Link>

            <section aria-labelledby="faq-title" className="flex flex-col gap-2">
              <h2 id="faq-title" className="font-display text-2xl font-normal">Good to know</h2>
              {FAQS.map(([q, a], i) => (
                <div key={q} className="rounded-[18px] border border-[var(--nn-border)] bg-card">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                    aria-expanded={!!open[i]}
                    aria-controls={`faq-${i}`}
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left text-[15px] font-semibold"
                  >
                    {q}
                    <span aria-hidden="true" className="text-lg">{open[i] ? "−" : "+"}</span>
                  </button>
                  {open[i] && (
                    <p id={`faq-${i}`} className="px-4 pb-4 text-[15px] text-muted-foreground">
                      {a}
                    </p>
                  )}
                </div>
              ))}
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </RoleTheme>
  );
};

export default Membership;
