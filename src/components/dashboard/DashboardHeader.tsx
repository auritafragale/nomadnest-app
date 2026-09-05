import { Link } from "react-router-dom";
import { Crown, Eye, Heart, MapPin, Plus, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import { useMembership, MEMBERSHIP_PLANS } from "@/hooks/useMembership";

interface DashboardHeaderProps {
  role: "sitter" | "owner";
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  city?: string | null;
  country?: string | null;
}

/**
 * One tidy header: who you are, your status, where you are, and the few
 * actions that matter. Sign out now lives in the top navigation menu.
 */
const DashboardHeader = ({
  role,
  userId,
  displayName,
  avatarUrl,
  city,
  country,
}: DashboardHeaderProps) => {
  const { subscribed, membershipType, foundingMember, loading } = useMembership();

  const planName = membershipType
    ? MEMBERSHIP_PLANS[membershipType as keyof typeof MEMBERSHIP_PLANS]?.name ?? "Membership"
    : null;

  const editTo = role === "sitter" ? "/edit-sitter-profile" : "/edit-owner-profile";
  const publicTo = role === "sitter" ? `/sitter/${userId}` : `/owner/${userId}`;
  const location = city && country ? `${city}, ${country}` : null;

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-14 h-14 shrink-0 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <User className="w-7 h-7 text-primary" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-3xl font-display font-bold text-foreground truncate">
            Welcome back, {displayName}!
          </h1>

          {!loading && (foundingMember || (subscribed && planName)) && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {foundingMember && <FoundingMemberBadge />}
              {subscribed && planName && (
                <Badge className="bg-primary/10 text-primary border-0 text-[11px] px-2 py-0">
                  {planName}
                </Badge>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-1.5 min-w-0">
            <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {location ?? "Add your location for better matches"}
            </p>
            <Link to={publicTo} aria-label="View your profile as others see it">
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Eye className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {role === "owner" ? (
          <Link to="/create-listing">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Create Listing
            </Button>
          </Link>
        ) : (
          <Link to="/saved">
            <Button size="sm" variant="outline">
              <Heart className="w-4 h-4 mr-2" />
              Saved Sits
            </Button>
          </Link>
        )}
        <Link to={editTo}>
          <Button size="sm" variant="outline">
            <User className="w-4 h-4 mr-2" />
            Edit Profile
          </Button>
        </Link>
        {!loading && !subscribed && (
          <Link to="/membership">
            <Button size="sm" variant="outline">
              <Crown className="w-4 h-4 mr-2" />
              View plans
            </Button>
          </Link>
        )}
        <Link to="/settings">
          <Button variant="outline" size="icon" aria-label="Settings">
            <Settings className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default DashboardHeader;
