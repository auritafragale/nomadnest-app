import { Crown, CreditCard, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { Badge } from "@/components/ui/badge";
import { useMembership, MEMBERSHIP_PLANS } from "@/hooks/useMembership";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";

const MembershipStatusCard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { subscribed, membershipType, foundingMember, subscriptionEnd, loading, openPortal } = useMembership();
  const [portalLoading, setPortalLoading] = useState(false);

  const handleManage = async () => {
    setPortalLoading(true);
    try {
      await openPortal();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not open subscription management", variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const planName = membershipType
    ? MEMBERSHIP_PLANS[membershipType as keyof typeof MEMBERSHIP_PLANS]?.name ?? "Membership"
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Crown className="w-4 h-4 text-accent" />
          Membership
          <HelpTooltip
            label="About membership"
            content="Your membership tier gates listing creation and inviting nomads. NomadNest is a barter — free stays for free sitting — so the membership covers running the platform, not the sit."
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {subscribed ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="default" className="bg-primary/10 text-primary border-0">
                {planName}
              </Badge>
              {foundingMember && <FoundingMemberBadge />}
            </div>

            {subscriptionEnd && (
              <p className="text-sm text-muted-foreground">
                Renews {new Date(subscriptionEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}

            {foundingMember && !subscriptionEnd && (
              <p className="text-sm text-muted-foreground">Lifetime access — no expiry</p>
            )}

            {!foundingMember && (
              <Button variant="outline" size="sm" onClick={handleManage} disabled={portalLoading} className="w-full">
                {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
                Manage Subscription
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No active membership</p>
            <Button size="sm" onClick={() => navigate("/membership")} className="w-full">
              <Crown className="w-4 h-4 mr-2" />
              View Plans
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MembershipStatusCard;
