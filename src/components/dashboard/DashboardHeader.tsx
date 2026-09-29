import { Link } from "react-router-dom";
import { Briefcase, ChevronRight, Edit, Eye, Heart, Home, MapPin, Plus, Settings, Star, User } from "lucide-react";
import { useMembership, MEMBERSHIP_PLANS } from "@/hooks/useMembership";
import { useListingAllowance } from "@/hooks/useListingAllowance";
import { useOwnerListings } from "@/hooks/useOwnerListings";
import type { Completion } from "@/lib/profileCompletion";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
  role: "sitter" | "owner";
  /** The Nomad / Pet Parent switch (combined members only). */
  modeSwitch?: React.ReactNode;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  city?: string | null;
  country?: string | null;
  completion: Completion;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning," : h < 18 ? "Good afternoon," : "Good evening,";
};

const circleBtn =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--nn-border)] bg-white text-[#1F1B16] hover:bg-[var(--nn-soft)]";
// Phone and desktop: two equal pills. Tablet: sized to their labels.
const pillBtn =
  "flex h-11 min-w-0 flex-1 md:flex-none md:px-4 lg:flex-1 lg:px-2 lg:text-[13px] xl:text-sm items-center justify-center gap-1.5 rounded-full border-[1.5px] border-[var(--nn-border)] bg-white px-3 text-sm font-bold text-[#1F1B16] hover:bg-[var(--nn-soft)]";

/**
 * Profile block of both dashboards: photo with the completion ring, greeting,
 * city, Founding Member and membership pills, the four actions, the "Finish
 * your profile" card (hidden at 100%) and the mode switch.
 *
 * Returns its parts as siblings so the dashboard's profile column can place
 * them: phone, one column (as before); tablet, the profile card as a row with
 * Finish your profile beside the mode switch; desktop, one card holding the
 * profile and Finish your profile, with the mode switch below.
 */
const DashboardHeader = ({ role, modeSwitch, userId, displayName, avatarUrl, city, country, completion }: DashboardHeaderProps) => {
  const { subscribed, membershipType, foundingMember, loading } = useMembership();
  const { atLimit } = useListingAllowance();
  const { data: listings = [], isLoading: listingsLoading } = useOwnerListings();

  const planName = membershipType
    ? MEMBERSHIP_PLANS[membershipType as keyof typeof MEMBERSHIP_PLANS]?.name ?? "Membership"
    : null;
  const editTo = role === "sitter" ? "/edit-sitter-profile" : "/edit-owner-profile";
  const previewTo = role === "sitter" ? `/sitter/${userId}?preview=1` : `/owner/${userId}?preview=1`;
  const location = [city, country].filter(Boolean).join(", ");
  const latestListing = listings[0];
  const percent = completion.percent;

  const size = 72;
  const r = 33;
  const c = 2 * Math.PI * r;

  const pills = (className: string) =>
    !loading && (foundingMember || (subscribed && planName)) ? (
      <div className={cn("flex-wrap gap-1.5", className)}>
        {foundingMember && (
          <span className="inline-flex h-[26px] items-center gap-1 rounded-full bg-[#E8B53E] px-2.5 text-xs font-bold text-[#3A2A06]">
            <Star className="h-3 w-3 fill-[#3A2A06]" aria-hidden="true" />
            Founding Member
          </span>
        )}
        {subscribed && planName && (
          <span className="inline-flex h-[26px] items-center rounded-full bg-[var(--nn-chip)] px-2.5 text-xs font-bold text-[#3F444B]">
            {planName.toLowerCase().includes("membership") ? planName : `${planName} membership`}
          </span>
        )}
      </div>
    ) : null;

  return (
    <>
    <section
      aria-label="Your profile"
      className="flex flex-col gap-4 md:contents lg:flex lg:rounded-[24px] lg:border lg:border-[var(--nn-border)] lg:bg-white lg:p-5 xl:p-[22px]"
    >
      <div className="flex flex-col gap-4 md:col-span-2 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-5 md:gap-y-3 md:rounded-[24px] md:border md:border-[var(--nn-border)] md:p-[22px] lg:flex lg:items-stretch lg:rounded-none lg:border-0 lg:p-0">
      <div className="flex min-w-0 items-center gap-3.5 md:gap-4 lg:gap-3.5">
        <Link
          to={percent < 100 ? editTo : previewTo}
          className="relative shrink-0"
          style={{ width: size, height: size }}
          aria-label={percent < 100 ? `Finish your profile, ${percent}% done` : "See your public profile"}
        >
          {percent < 100 && (
            <svg width={size} height={size} viewBox="0 0 72 72" className="absolute inset-0" aria-hidden="true">
              <circle cx="36" cy="36" r={r} fill="none" stroke="var(--nn-track)" strokeWidth="4" />
              <circle
                cx="36"
                cy="36"
                r={r}
                fill="none"
                stroke="var(--nn-accent)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${(c * percent) / 100} ${c}`}
                transform="rotate(-90 36 36)"
              />
            </svg>
          )}
          <span className="absolute inset-[7px] flex items-center justify-center overflow-hidden rounded-full bg-[#D8C3B0] text-[22px] font-bold text-[#5A4636]">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover object-center" />
            ) : (
              displayName.slice(0, 1).toUpperCase()
            )}
          </span>
        </Link>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm text-[#656B74]">{greeting()}</span>
          <h1 className="truncate font-display text-[32px] font-normal leading-[1.05]">{displayName}</h1>
          <span className="flex min-w-0 items-center gap-1 text-[13px] text-[#656B74]">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{location || "Add your city"}</span>
          </span>
          {pills("hidden pt-1 md:flex lg:hidden")}
        </div>
      </div>

      {pills("flex md:hidden lg:flex")}
      {!loading && !subscribed && (
        <Link
          to="/membership"
          className="text-sm font-bold text-[var(--nn-accent-dark)] underline-offset-2 hover:underline md:col-start-1 md:self-start"
        >
          View membership plans
        </Link>
      )}

      <div className="flex gap-2 md:col-start-2 md:row-span-2 md:row-start-1 lg:col-auto lg:row-auto">
        {role === "sitter" ? (
          <Link to="/saved" className={pillBtn}>
            <Heart className="h-4 w-4 shrink-0 lg:hidden" aria-hidden="true" />
            <span className="truncate">Saved sits</span>
          </Link>
        ) : listingsLoading ? (
          <span className={cn(pillBtn, "opacity-60")} aria-hidden="true">
            …
          </span>
        ) : latestListing ? (
          <Link to={`/edit-listing/${latestListing.id}`} className={pillBtn}>
            <Home className="h-4 w-4 shrink-0 lg:hidden" aria-hidden="true" />
            <span className="truncate">Edit listing</span>
          </Link>
        ) : !atLimit ? (
          <Link to="/create-listing" className={pillBtn}>
            <Plus className="h-4 w-4 shrink-0 lg:hidden" aria-hidden="true" />
            <span className="truncate">Create listing</span>
          </Link>
        ) : null}
        <Link to={editTo} className={pillBtn}>
          <User className="h-4 w-4 shrink-0 lg:hidden" aria-hidden="true" />
          <span className="truncate">Edit profile</span>
        </Link>
        <Link to={previewTo} className={circleBtn} aria-label="See my public profile" title="See my public profile">
          <Eye className="h-[19px] w-[19px]" aria-hidden="true" />
        </Link>
        <Link to="/settings" className={circleBtn} aria-label="Settings">
          <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
        </Link>
      </div>
      </div>

      {percent < 100 && (
        <Link
          to={editTo}
          aria-label={`Finish your profile, ${percent}% done`}
          className={cn(
            "flex items-center gap-3.5 rounded-[20px] border border-[var(--nn-border)] bg-[var(--nn-soft)] px-4 py-3.5",
            !modeSwitch && "md:col-span-2",
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-bold">Finish your profile</span>
              <span className="text-[13px] font-bold text-[var(--nn-accent-dark)]">{percent}%</span>
            </span>
            <span className="block h-1.5 rounded-full bg-[var(--nn-border)]">
              <span className="block h-1.5 rounded-full bg-[var(--nn-accent)]" style={{ width: `${percent}%` }} />
            </span>
            {completion.line && (
              <span className="text-xs text-[#656B74]">
                {completion.line}
                {role === "sitter" ? " to get invited more often." : " so Nomads get to know you."}
              </span>
            )}
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[var(--nn-accent-dark)]" aria-hidden="true" />
        </Link>
      )}
    </section>
    {modeSwitch && (
      <div className={cn("md:col-start-2 md:self-center lg:self-auto", percent >= 100 && "md:w-[300px] md:justify-self-end lg:w-auto")}>
        {modeSwitch}
      </div>
    )}
    </>
  );
};

/** Nomad / Pet Parent switch for combined members. */
export const ModeSwitch = ({ role, onChange }: { role: "sitter" | "owner"; onChange: (role: "sitter" | "owner") => void }) => (
  <nav aria-label="Dashboard mode" className="grid grid-cols-2 gap-1 rounded-full bg-[var(--nn-chip)] p-1">
    {([
      { value: "sitter", label: "Nomad", icon: Briefcase },
      { value: "owner", label: "Pet Parent", icon: Home },
    ] as const).map(({ value, label, icon: Icon }) => (
      <button
        key={value}
        type="button"
        onClick={() => onChange(value)}
        aria-pressed={role === value}
        className={cn(
          "flex h-11 items-center justify-center gap-1.5 rounded-full text-sm",
          role === value ? "bg-[var(--nn-accent)] font-bold text-white" : "font-semibold text-[#3F444B]",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
    ))}
  </nav>
);

export default DashboardHeader;
