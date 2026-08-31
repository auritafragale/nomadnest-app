import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Crown, Star, Sparkles, Shield, Gift, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useMembership, MEMBERSHIP_PLANS } from "@/hooks/useMembership";
import { usePerks } from "@/hooks/usePerks";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Loader2 } from "lucide-react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

const PERK_EXAMPLES = [
  "Travel insurance",
  "eSIMs & connectivity",
  "Luggage storage",
  "Airport lounges",
  "Pet insurance & care",
  "Gear & tech",
  "Coworking & wellness",
];

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  "Unlimited sit applications":
    "Apply to as many house-sits as you like, anywhere in the world. No caps, no per-application fees.",
  "Profile with reviews":
    "A public Nomad profile showing your verified badges, reviews from Pet Parents, and bio so families can trust you.",
  "Find Nomads map":
    "See other Nomads on an interactive map and connect with the community wherever you travel.",
  "Community access":
    "Join city chat rooms and talk to local Nomads and Pet Parents before you arrive.",
  "Unlimited listing posts":
    "List every home and pet you need sat. Manage multiple listings with no per-listing charge.",
  "Manage applications":
    "Review Nomad applicants, message them, and choose who stays — all in one place.",
  "Map listing visibility":
    "Your listings appear on the browse map with coral pins so Nomads can discover them.",
  "Zero-cost sits, no commissions":
    "Members trade free accommodation for free pet care. You never pay a booking fee — the only cost is your annual membership.",
  "Everything in Nomad plan":
    "All Nomad benefits: unlimited applications, profile with reviews, Find Nomads map and community access.",
  "Everything in Pet Parent plan":
    "All Pet Parent benefits: unlimited listings, application management, map visibility and community access.",
  "Member Perks & partner discounts": "__PERKS__",
};

function FeatureRow({ feature, perksLive }: { feature: string; perksLive: boolean }) {
  const [open, setOpen] = useState(false);
  const isPerks = feature === "Member Perks & partner discounts";
  const desc = FEATURE_DESCRIPTIONS[feature] ?? "Included with your NomadNest membership.";

  return (
    <li className="border-b border-border/60 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start gap-2 py-2.5 text-left group"
      >
        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <span className="flex-1 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {feature}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="pl-7 pb-3 -mt-1">
          {isPerks ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {perksLive
                  ? "Exclusive partner deals negotiated for members — some links earn NomadNest a small commission to keep fees low."
                  : "Partner perks are rolling out now. The first deals go live shortly and every membership gets them automatically — some links earn NomadNest a small commission to keep fees low."}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {PERK_EXAMPLES.map((ex) => (
                  <li
                    key={ex}
                    className="text-[11px] rounded-full bg-primary/10 text-primary px-2 py-0.5"
                  >
                    {ex}
                  </li>
                ))}
              </ul>
              <Link
                to="/perks"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-1"
              >
                Browse all perks <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed pr-6">{desc}</p>
          )}
        </div>
      )}
    </li>
  );
}

const Membership = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { subscribed, membershipType, foundingMember, loading, startCheckout, redeemFoundingMemberCode } = useMembership();
  // Don't promise a stocked perks hub until there are enough partners live.
  const { perks } = usePerks();
  const perksLive = perks.length >= 3;

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [foundingLoading, setFoundingLoading] = useState(false);
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [activeTab, setActiveTab] = useState<"sitter" | "owner" | "combined">("combined");

  const cancelled = searchParams.get("cancelled");
  const upgradeBoth = searchParams.get("upgrade") === "both";

  const handleCheckout = async (planKey: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setCheckoutLoading(planKey);
    try {
      const plan = MEMBERSHIP_PLANS[planKey as keyof typeof MEMBERSHIP_PLANS];
      await startCheckout(plan.priceId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const openFoundingDialog = () => {
    if (!user) {
      // Send to the registration page where the invite code field is shown.
      navigate("/auth?signup=true");
      return;
    }
    setInviteCode("");
    setCodeDialogOpen(true);
  };

  const handleRedeemCode = async () => {
    if (!inviteCode.trim()) {
      toast({ title: "Enter a code", description: "Please paste your Founding Member invite code.", variant: "destructive" });
      return;
    }
    setFoundingLoading(true);
    try {
      const result = await redeemFoundingMemberCode(inviteCode);
      if (result === "ok") {
        toast({ title: "Welcome, Founding Member! 🎉", description: "You have free lifetime Combined access." });
        setCodeDialogOpen(false);
        navigate("/dashboard");
      } else if (result === "exhausted") {
        toast({
          title: "All founding spots claimed",
          description: "The code was valid but all 900 spots are taken. You can join with a paid plan.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Invalid invite code",
          description: "That code wasn't recognised. Please check it and try again.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setFoundingLoading(false);
    }
  };

  const tabs: { key: "sitter" | "owner" | "combined"; label: string; sublabel: string }[] = [
    { key: "sitter", label: "Become a Nomad", sublabel: "Find free stays" },
    { key: "owner", label: "List Your Home", sublabel: "Find a sitter" },
    { key: "combined", label: "Go Combined", sublabel: "Best value" },
  ];

  const isCurrentPlan = (planKey: string) => {
    if (foundingMember && planKey === "combined") return true;
    return subscribed && membershipType === planKey;
  };

  const activePlan = MEMBERSHIP_PLANS[activeTab];
  const activeMeta = tabs.find((t) => t.key === activeTab)!;
  const activeIcon =
    activeTab === "sitter" ? <Star className="w-6 h-6" /> : activeTab === "owner" ? <Shield className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />;
  const activeBadge = activeTab === "combined" ? "Best Value" : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-20 pb-12">
        {/* No Booking Fees Banner */}
        <div className="bg-primary text-primary-foreground rounded-2xl p-6 mb-12 text-center">
          <h2 className="text-2xl md:text-3xl font-bold">No booking fees. Ever.</h2>
          <p className="mt-2 text-primary-foreground/80">
            One simple annual membership. That's it. No commissions, no hidden costs.
          </p>
        </div>

        {cancelled && (
          <div className="bg-warning/10 border border-warning text-warning-foreground rounded-lg p-4 mb-8 text-center">
            Payment was cancelled. You can try again whenever you're ready.
          </div>
        )}

        {upgradeBoth && (
          <div className="bg-primary/10 border border-primary text-foreground rounded-lg p-4 mb-8 text-center">
            Upgrade to the <strong>Combined Membership</strong> to use NomadNest as both a Nomad and Pet Parent.
          </div>
        )}

        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-1.5">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">Choose Your Membership</h1>
            <HelpTooltip
              align="center"
              label="Why a membership"
              content="NomadNest is a barter — free accommodation for free pet sitting. No money changes hands for sits, so this membership covers running the platform, not the sit itself."
            />
          </div>
          <p className="mt-3 text-muted-foreground text-lg max-w-2xl mx-auto">
            Join the NomadNest community and start connecting with trusted pet lovers around the world.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* CTA toggle buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 max-w-3xl mx-auto">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-4 py-3 text-center transition-all border-2 ${
                      isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-md"
                        : "border-border bg-card text-foreground hover:border-primary/50"
                    }`}
                  >
                    <span className="text-sm font-bold leading-tight">{tab.label}</span>
                    <span className={`text-xs ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      {tab.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active plan card */}
            <div className="max-w-md mx-auto mb-16">
              <Card
                className={`relative overflow-hidden transition-all ${
                  activeTab === "combined"
                    ? "border-2 border-primary shadow-xl"
                    : "border-border shadow-md"
                } ${isCurrentPlan(activeTab) ? "ring-2 ring-accent" : ""} ${
                  upgradeBoth && activeTab === "combined" ? "ring-4 ring-primary ring-offset-2" : ""
                }`}
              >
                {activeBadge && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 text-xs font-bold rounded-bl-lg">
                    {activeBadge}
                  </div>
                )}
                {isCurrentPlan(activeTab) && (
                  <div className="absolute top-0 left-0 bg-accent text-accent-foreground px-4 py-1 text-xs font-bold rounded-br-lg">
                    Your Plan
                  </div>
                )}
                <CardHeader className="text-center pt-8">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                    {activeIcon}
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{activePlan.name}</h3>
                  <div className="mt-2">
                    <span className="text-4xl font-bold text-foreground">{activePlan.price}</span>
                    <span className="text-muted-foreground">/{activePlan.interval}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border/60">
                    {activePlan.features.map((feature) => (
                      <FeatureRow key={feature} feature={feature} perksLive={perksLive} />
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="pb-8">
                  {isCurrentPlan(activeTab) ? (
                    <Button className="w-full" variant="outline" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={activeTab === "combined" ? "default" : "outline"}
                      onClick={() => handleCheckout(activeTab)}
                      disabled={!!checkoutLoading}
                    >
                      {checkoutLoading === activeTab ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Get Started
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </div>

            {/* Founding Member Section */}
            {!subscribed && !foundingMember && (
              <div className="bg-accent/10 border-2 border-accent rounded-2xl p-8 text-center max-w-xl mx-auto">
                <Crown className="w-10 h-10 text-accent mx-auto mb-4" />
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  <h3 className="text-xl font-bold text-foreground">Join as a Founding Member</h3>
                  <HelpTooltip
                    align="center"
                    label="About founding member codes"
                    content="A Founding Member code is an invite granted to early supporters. Redeeming one unlocks free lifetime Combined membership — no annual fee."
                  />
                </div>
                <p className="text-muted-foreground mb-6">
                  Be one of the first to shape NomadNest. Founding Member spots are limited and require an invite code.
                </p>
                <Button
                  size="lg"
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={openFoundingDialog}
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Redeem Invite Code
                </Button>
              </div>
            )}

            {foundingMember && (
              <div className="bg-accent/10 border-2 border-accent rounded-2xl p-8 text-center max-w-xl mx-auto">
                <Crown className="w-10 h-10 text-accent mx-auto mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">You're a Founding Member! 🎉</h3>
                <p className="text-muted-foreground">
                  You have full Combined access to NomadNest — forever. Thank you for being an early supporter.
                </p>
              </div>
            )}

            <div className="text-center mt-10">
              <p className="text-sm text-muted-foreground mb-3">
                {perksLive
                  ? "Every membership also unlocks exclusive partner deals on travel, insurance, pet care and gear."
                  : "Partner perks on travel, insurance, pet care and gear are rolling out — included with every membership."}
              </p>
              <Button variant="outline" asChild>
                <Link to="/perks">
                  <Gift className="w-4 h-4 mr-2" />
                  See Member Perks
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>

      <Dialog open={codeDialogOpen} onOpenChange={setCodeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem Founding Member Code</DialogTitle>
            <DialogDescription>
              Enter your invite code to unlock free lifetime Combined membership. Spots are limited to 900.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter your code"
              autoFocus
              disabled={foundingLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !foundingLoading) handleRedeemCode();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeDialogOpen(false)} disabled={foundingLoading}>
              Cancel
            </Button>
            <Button onClick={handleRedeemCode} disabled={foundingLoading}>
              {foundingLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crown className="w-4 h-4 mr-2" />}
              Redeem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default Membership;
