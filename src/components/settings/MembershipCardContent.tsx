import { Loader2, Crown, CreditCard, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import UpgradeRoleDialog from "@/components/dashboard/UpgradeRoleDialog";
import { useMembership, MEMBERSHIP_PLANS } from "@/hooks/useMembership";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  role: "sitter" | "owner" | "both";
  onUpgrade: () => void;
}

export const MembershipCardContent = ({ role, onUpgrade }: Props) => {
  const { user } = useAuth();
  const { subscribed, membershipType, foundingMember, subscriptionEnd, loading, openPortal } = useMembership();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Founding member — lifetime access
  if (foundingMember) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <FoundingMemberBadge />
          <Badge className="bg-primary/10 text-primary border-0">Combined</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Lifetime access — thank you for being an early supporter.
        </p>
      </div>
    );
  }

  // Active paid membership
  if (subscribed && membershipType) {
    const planName = MEMBERSHIP_PLANS[membershipType as keyof typeof MEMBERSHIP_PLANS]?.name ?? membershipType;
    const renewalDate = subscriptionEnd
      ? new Date(subscriptionEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : null;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Badge className="bg-primary/10 text-primary border-0">{planName}</Badge>
          <span className="text-sm font-medium text-muted-foreground">Active</span>
        </div>
        {renewalDate && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            Renews on {renewalDate}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => openPortal()}>
            <CreditCard className="w-4 h-4 mr-2" />
            Manage
          </Button>
        </div>
      </div>
    );
  }

  // Inactive — show upgrade for single-role, or view plans for all
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        You don't have an active membership yet.
      </p>
      {(role === "sitter" || role === "owner") ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-medium">Upgrade to Combined</p>
            <p className="text-sm text-muted-foreground">
              {role === "sitter"
                ? "Add Pet Parent access to list your home and pets."
                : "Add Nomad access to browse and apply for sits."}
            </p>
          </div>
          <UpgradeRoleDialog currentRole={role} onUpgrade={onUpgrade} />
        </div>
      ) : (
        <Button variant="outline" size="sm" asChild>
          <a href="/membership">
            <Crown className="w-4 h-4 mr-2" />
            View plans
          </a>
        </Button>
      )}
    </div>
  );
};
