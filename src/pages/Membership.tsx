import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Crown, Star, Sparkles, Shield } from "lucide-react";
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
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Loader2 } from "lucide-react";

const Membership = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { subscribed, membershipType, foundingMember, loading, startCheckout, redeemFoundingMemberCode } = useMembership();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [foundingLoading, setFoundingLoading] = useState(false);
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  const cancelled = searchParams.get("cancelled");

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
      navigate("/auth");
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

  const plans = [
    {
      key: "sitter",
      icon: <Star className="w-6 h-6" />,
      badge: null,
    },
    {
      key: "combined",
      icon: <Sparkles className="w-6 h-6" />,
      badge: "Best Value",
    },
    {
      key: "owner",
      icon: <Shield className="w-6 h-6" />,
      badge: null,
    },
  ];

  const isCurrentPlan = (planKey: string) => {
    if (foundingMember && planKey === "combined") return true;
    return subscribed && membershipType === planKey;
  };

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

        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">Choose Your Membership</h1>
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
            <div className="grid md:grid-cols-3 gap-6 mb-16">
              {plans.map(({ key, icon, badge }) => {
                const plan = MEMBERSHIP_PLANS[key as keyof typeof MEMBERSHIP_PLANS];
                const isCurrent = isCurrentPlan(key);
                const isCombined = key === "combined";

                return (
                  <Card
                    key={key}
                    className={`relative overflow-hidden transition-all ${
                      isCombined
                        ? "border-2 border-primary shadow-xl scale-[1.02]"
                        : "border-border"
                    } ${isCurrent ? "ring-2 ring-accent" : ""}`}
                  >
                    {badge && (
                      <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 text-xs font-bold rounded-bl-lg">
                        {badge}
                      </div>
                    )}
                    {isCurrent && (
                      <div className="absolute top-0 left-0 bg-accent text-accent-foreground px-4 py-1 text-xs font-bold rounded-br-lg">
                        Your Plan
                      </div>
                    )}
                    <CardHeader className="text-center pt-8">
                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                        {icon}
                      </div>
                      <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                      <div className="mt-2">
                        <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                        <span className="text-muted-foreground">/{plan.interval}</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2">
                            <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                            <span className="text-sm text-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter className="pb-8">
                      {isCurrent ? (
                        <Button className="w-full" variant="outline" disabled>
                          Current Plan
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          variant={isCombined ? "default" : "outline"}
                          onClick={() => handleCheckout(key)}
                          disabled={!!checkoutLoading}
                        >
                          {checkoutLoading === key ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : null}
                          Get Started
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>

            {/* Founding Member Section */}
            {!subscribed && !foundingMember && (
              <div className="bg-accent/10 border-2 border-accent rounded-2xl p-8 text-center max-w-xl mx-auto">
                <Crown className="w-10 h-10 text-accent mx-auto mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">Join as a Founding Member</h3>
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
