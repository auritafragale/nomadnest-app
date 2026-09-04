import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Crown, CreditCard, Loader2, User, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import { useMembership, MEMBERSHIP_PLANS } from "@/hooks/useMembership";
import { useToast } from "@/hooks/use-toast";

interface MemberMembershipCardProps {
  role: "sitter" | "owner";
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  userId: string;
}

/**
 * Membership status and the member's own card merged into one compact block,
 * so the dashboard does not spend two cards on the same information.
 */
const MemberMembershipCard = ({ role, name, subtitle, avatarUrl, userId }: MemberMembershipCardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { subscribed, membershipType, foundingMember, subscriptionEnd, loading, openPortal } = useMembership();
  const [portalLoading, setPortalLoading] = useState(false);

  const handleManage = async () => {
    setPortalLoading(true);
    try {
      await openPortal();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Could not open subscription management",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const planName = membershipType
    ? MEMBERSHIP_PLANS[membershipType as keyof typeof MEMBERSHIP_PLANS]?.name ?? "Membership"
    : null;

  const editTo = role === "sitter" ? "/edit-sitter-profile" : "/edit-owner-profile";
  const publicTo = role === "sitter" ? `/sitter/${userId}` : `/owner/${userId}`;
  const editLabel = role === "sitter" ? "Edit Nomad Profile" : "Edit Pet Parent Profile";

  return (
    <Card variant="elevated">
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Member */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 shrink-0 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{name}</h3>
            {/* Badges sit directly under the name to save vertical space */}
            {!loading && subscribed && (
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                {planName && (
                  <Badge variant="default" className="bg-primary/10 text-primary border-0 text-[11px] px-2 py-0">
                    {planName}
                  </Badge>
                )}
                {foundingMember && <FoundingMemberBadge />}
              </div>
            )}
            <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
          </div>
        </div>

        {/* Membership */}
        <div className="rounded-xl border border-border bg-muted/30 p-2.5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Crown className="w-4 h-4 text-accent shrink-0" />
            Membership
            <HelpTooltip
              label="About membership"
              content="Your membership tier gates listing creation and inviting nomads. NomadNest is a barter — free stays for free sitting — so the membership covers running the platform, not the sit."
            />
          </div>

          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : subscribed ? (
            <>
              {subscriptionEnd ? (
                <p className="text-xs text-muted-foreground">
                  Renews{" "}
                  {new Date(subscriptionEnd).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              ) : null}

              {!foundingMember && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManage}
                  disabled={portalLoading}
                  className="w-full"
                >
                  {portalLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="w-4 h-4 mr-2" />
                  )}
                  Manage Subscription
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">No active membership</p>
              <Button size="sm" onClick={() => navigate("/membership")} className="w-full">
                <Crown className="w-4 h-4 mr-2" />
                View Plans
              </Button>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Link to={editTo} className="flex-1 min-w-0">
            <Button className="w-full">
              <User className="w-4 h-4 mr-2" />
              <span className="truncate">{editLabel}</span>
            </Button>
          </Link>
          <Link to={publicTo}>
            <Button variant="ghost" size="icon" title="View as others see it">
              <Eye className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default MemberMembershipCard;
