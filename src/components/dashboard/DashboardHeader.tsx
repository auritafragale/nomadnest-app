import { Link } from "react-router-dom";
import { Briefcase, Crown, Edit, Eye, Heart, Home, MapPin, Plus, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import { useMembership, MEMBERSHIP_PLANS } from "@/hooks/useMembership";
import { useListingAllowance } from "@/hooks/useListingAllowance";
import { useOwnerListings } from "@/hooks/useOwnerListings";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
  role: "sitter" | "owner";
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  city?: string | null;
  country?: string | null;
  /** Profile completeness, shown as a ring around the photo. */
  profilePercent: number;
  /** Combined members switch between Nomad and Pet Parent here. */
  canSwitchRole: boolean;
  onSwitchRole: (role: "sitter" | "owner") => void;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

/**
 * Who you are, where you are, and the few actions that matter. The listing
 * button follows the member's state: Create Listing with no listing yet,
 * Edit Listing once they have one (within the listing limit).
 */
const DashboardHeader = ({
  role,
  userId,
  displayName,
  avatarUrl,
  city,
  country,
  profilePercent,
  canSwitchRole,
  onSwitchRole,
}: DashboardHeaderProps) => {
  const { subscribed, membershipType, foundingMember, loading } = useMembership();
  const { atLimit } = useListingAllowance();
  const { data: listings = [], isLoading: listingsLoading } = useOwnerListings();

  const planName = membershipType
    ? MEMBERSHIP_PLANS[membershipType as keyof typeof MEMBERSHIP_PLANS]?.name ?? "Membership"
    : null;

  const editTo = role === "sitter" ? "/edit-sitter-profile" : "/edit-owner-profile";
  const publicTo = role === "sitter" ? `/sitter/${userId}` : `/owner/${userId}`;
  const location = city && country ? `${city}, ${country}` : null;
  const latestListing = listings[0];

  // Profile ring around the photo.
  const size = 64;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const percent = Math.max(0, Math.min(100, profilePercent));

  return (
    <header className="mb-6 space-y-4">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          to={editTo}
          className="relative shrink-0"
          style={{ width: size, height: size }}
          aria-label={`Your profile is ${percent}% complete. Edit your profile`}
        >
          <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - percent / 100)}
              className={percent >= 100 ? "stroke-emerald-500" : "stroke-primary"}
            />
          </svg>
          <span className="absolute inset-[5px] flex items-center justify-center overflow-hidden rounded-full bg-primary/10">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover object-center" />
            ) : (
              <User className="h-6 w-6 text-primary" aria-hidden="true" />
            )}
          </span>
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="truncate font-display text-2xl font-bold text-foreground md:text-3xl">{displayName}</h1>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <p className="flex min-w-0 items-center gap-1 truncate text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{location ?? "Add your location for better matches"}</span>
            </p>
            <Link to={publicTo} aria-label="View your profile as others see it">
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Eye className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          {!loading && (foundingMember || (subscribed && planName)) && (
            <div className="mt-1 flex items-center gap-1.5 overflow-hidden">
              {foundingMember && <FoundingMemberBadge compact />}
              {subscribed && planName && (
                <Badge className="whitespace-nowrap border-0 bg-primary/10 px-1.5 py-0 text-[10px] text-primary">
                  {planName}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {role === "owner" ? (
          listingsLoading ? null : latestListing ? (
            <Button size="sm" className="rounded-full" asChild>
              <Link to={`/edit-listing/${latestListing.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Listing
              </Link>
            </Button>
          ) : (
            !atLimit && (
              <Button size="sm" className="rounded-full" asChild>
                <Link to="/create-listing">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Listing
                </Link>
              </Button>
            )
          )
        ) : (
          <Button size="sm" variant="outline" className="rounded-full" asChild>
            <Link to="/saved">
              <Heart className="mr-2 h-4 w-4" />
              Saved Sits
            </Link>
          </Button>
        )}
        <Button size="sm" variant="outline" className="rounded-full" asChild>
          <Link to={editTo}>
            <User className="mr-2 h-4 w-4" />
            Edit Profile
          </Link>
        </Button>
        <Button variant="outline" size="icon" className="rounded-full" aria-label="Settings" asChild>
          <Link to="/settings">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
        {!loading && !subscribed && (
          <Button size="sm" variant="outline" className="rounded-full" asChild>
            <Link to="/membership">
              <Crown className="mr-2 h-4 w-4" />
              View plans
            </Link>
          </Button>
        )}
      </div>

      {canSwitchRole && (
        <div className="flex w-full max-w-md gap-1 rounded-full bg-muted p-1" role="group" aria-label="Dashboard mode">
          {([
            { value: "sitter", label: "Nomad", icon: Briefcase },
            { value: "owner", label: "Pet Parent", icon: Home },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onSwitchRole(value)}
              aria-pressed={role === value}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-full py-1.5 text-sm font-medium transition-colors",
                role === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};

export default DashboardHeader;
