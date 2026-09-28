import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BookHeart, BookOpen, Bell, CalendarPlus, Home, MessageSquare, Plus, Star, User, Users, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile } from "@/lib/myProfile";
import Navbar from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { OwnerListingCard } from "@/components/dashboard/OwnerListingCard";
import { useOwnerListings } from "@/hooks/useOwnerListings";
import { useListingAllowance } from "@/hooks/useListingAllowance";
import DashboardHeader, { ModeSwitch } from "@/components/dashboard/DashboardHeader";
import { UpcomingPastSits } from "@/components/dashboard/UpcomingPastSits";
import { NowCard } from "@/components/dashboard/NowCard";
import { TodoList, type TodoItem } from "@/components/dashboard/TodoList";
import { SitStoriesSection } from "@/components/dashboard/SitStoriesSection";
import { NomadDashboard } from "@/components/nomad/NomadDashboard";
import { RoleTheme } from "@/components/nn/ui";
import { useDashboardSummary, type DashboardSummary } from "@/hooks/useDashboardSummary";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useGuideCompletion } from "@/hooks/useWelcomeGuide";
import { useMySitStories } from "@/hooks/useSitStories";
import { ownerCompletion, sitterCompletion } from "@/lib/profileCompletion";

interface Profile {
  first_name: string | null;
  avatar_url: string | null;
  country: string | null;
  city: string | null;
}

interface SitterProfile {
  headline: string | null;
  bio: string | null;
  pet_types: string[] | null;
  gallery: string[] | null;
}

interface OwnerProfile {
  bio: string | null;
}

const PUSH_BANNER_DISMISSED_KEY = "nomadnest_push_banner_dismissed";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const Dashboard = () => {
  const { user, role, loading } = useAuth();
  const { activeRole, setActiveRole } = useActiveRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openReviewSitId, setOpenReviewSitId] = useState<string | null>(null);
  // Stable identity so it doesn't re-trigger SitCard's auto-open effect on
  // every unrelated Dashboard re-render.
  const handleReviewAutoOpened = useCallback(() => setOpenReviewSitId(null), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sitterProfile, setSitterProfile] = useState<SitterProfile | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const { isSupported, isSubscribed, isLoading: pushLoading, subscribe } = usePushNotifications();
  const [pushBannerDismissed, setPushBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem(PUSH_BANNER_DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const { data: summary } = useDashboardSummary();

  const dismissPushBanner = () => {
    try {
      localStorage.setItem(PUSH_BANNER_DISMISSED_KEY, "true");
    } catch {
      // Private mode: dismiss for this visit only.
    }
    setPushBannerDismissed(true);
  };

  const showPushBanner = isSupported && !isSubscribed && !pushBannerDismissed && !!user;

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (searchParams.get("membership") === "success") {
      import("sonner").then(({ toast }) => {
        toast.success("Membership activated! 🎉", { description: "Welcome to NomadNest. You now have full access." });
      });
      searchParams.delete("membership");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Older links: invitations and applications now have their own pages.
  useEffect(() => {
    if (searchParams.get("section") === "invites") {
      navigate("/invitations", { replace: true });
      return;
    }
    const appTab = searchParams.get("appTab");
    if (appTab) {
      const tab = appTab === "accepted" || appTab === "pending" || appTab === "past" ? appTab : "all";
      navigate(`/my-applications?tab=${tab}`, { replace: true });
    }
  }, [searchParams, navigate]);

  // Deep link from a review reminder: land a combined member in the correct
  // mode first, then open that sit's review.
  useEffect(() => {
    if (loading) return;
    const mode = searchParams.get("mode");
    const openReview = searchParams.get("openReview");
    if (!mode && !openReview) return;
    if ((mode === "owner" || mode === "sitter") && role === "both") {
      setActiveRole(mode);
    }
    if (openReview) {
      setOpenReviewSitId(openReview);
    }
    searchParams.delete("mode");
    searchParams.delete("openReview");
    setSearchParams(searchParams, { replace: true });
  }, [loading, role, searchParams, setSearchParams, setActiveRole]);

  useEffect(() => {
    const fetchProfiles = async () => {
      if (!user) return;
      const { data: profileData } = await fetchMyProfile().catch(() => ({ data: null }));
      if (profileData) setProfile(profileData);

      if (role === "sitter" || role === "both") {
        const { data: sitterData } = await supabase
          .from("sitter_profiles")
          .select("headline, bio, pet_types, gallery")
          .eq("user_id", user.id)
          .maybeSingle();
        if (sitterData) setSitterProfile(sitterData);
      }

      if (role === "owner" || role === "both") {
        const { data: ownerData } = await supabase
          .from("owner_profiles")
          .select("bio")
          .eq("user_id", user.id)
          .maybeSingle();
        if (ownerData) setOwnerProfile(ownerData);
      }
    };

    fetchProfiles();
  }, [user, role]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const displayName = profile?.first_name || user?.email?.split("@")[0] || "there";
  const viewRole: "sitter" | "owner" =
    role === "both" ? (activeRole === "owner" ? "owner" : "sitter") : role === "owner" ? "owner" : "sitter";
  const completion = viewRole === "sitter" ? sitterCompletion(profile, sitterProfile) : ownerCompletion(profile, ownerProfile);

  // A review opened from the Pet Parent to-do list: open it on its sit card.
  const openReview = (sitId: string) => {
    setOpenReviewSitId(sitId);
    window.setTimeout(() => {
      document.getElementById("your-sits")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  return (
    <RoleTheme role={viewRole} className="min-h-screen">
      <Navbar />

      {/* Push notification opt-in banner */}
      {showPushBanner && (
        <div className="fixed top-16 left-0 right-0 z-40 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 shrink-0" />
            <span className="text-sm truncate">
              Enable notifications to get instant alerts for new messages, applications and invitations
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="secondary" className="h-9 text-xs" disabled={pushLoading} onClick={subscribe}>
              Enable
            </Button>
            <button
              onClick={dismissPushBanner}
              className="flex h-11 w-11 items-center justify-center text-primary-foreground/70 hover:text-primary-foreground"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className={`pb-24 md:pb-12 ${showPushBanner ? "pt-32" : "pt-20 md:pt-24"}`}>
        <div className="mx-auto flex max-w-xl flex-col gap-[18px] px-5">
          <DashboardHeader
            role={viewRole}
            userId={user?.id || ""}
            displayName={displayName}
            avatarUrl={profile?.avatar_url}
            city={profile?.city}
            country={profile?.country}
            completion={completion}
          />

          {role === "both" && <ModeSwitch role={viewRole} onChange={setActiveRole} />}

          {viewRole === "sitter" ? (
            <NomadDashboard
              summary={summary}
              completion={completion}
              openReviewSitId={openReviewSitId}
              onReviewHandled={handleReviewAutoOpened}
            />
          ) : (
            <OwnerDashboard
              summary={summary}
              profilePercent={completion.percent}
              openReview={openReviewSitId}
              onReviewAutoOpened={handleReviewAutoOpened}
              onOpenReview={openReview}
            />
          )}
        </div>
      </main>
    </RoleTheme>
  );
};

interface RoleDashboardProps {
  summary: DashboardSummary | undefined;
  profilePercent: number;
  openReview?: string | null;
  onReviewAutoOpened?: (sitId: string) => void;
  onOpenReview: (sitId: string) => void;
}

/** To-do rows shared by both roles: messages, reviews, profile. */
const commonTodos = (
  role: "sitter" | "owner",
  summary: DashboardSummary | undefined,
  unread: number,
  profilePercent: number,
  onOpenReview: (sitId: string) => void,
): TodoItem[] => {
  const items: TodoItem[] = [];
  for (const review of (summary?.reviews_due ?? []).filter((r) => r.role === role)) {
    items.push({
      key: `review-${review.sit_id}`,
      icon: Star,
      label: `Leave a review for ${review.other_first_name}${review.days_left <= 3 ? ` (${plural(review.days_left, "day")} left)` : ""}`,
      onClick: () => onOpenReview(review.sit_id),
    });
  }
  if (unread > 0) {
    items.push({ key: "messages", icon: MessageSquare, label: `Reply to ${plural(unread, "unread message")}`, to: "/inbox" });
  }
  if (profilePercent < 100) {
    items.push({
      key: "profile",
      icon: User,
      label: `Complete your profile (${profilePercent}%)`,
      to: role === "sitter" ? "/edit-sitter-profile" : "/edit-owner-profile",
    });
  }
  return items;
};

/** Welcome Guide to-do for the member's most recent listing. */
const useGuideTodo = (listingId: string | undefined): TodoItem | null => {
  const { data } = useGuideCompletion(listingId);
  if (!listingId || !data || data.percent >= 100) return null;
  return {
    key: "guide",
    icon: BookOpen,
    label: `Finish your Welcome Guide (${data.percent}%)`,
    to: `/listing/${listingId}/welcome-guide`,
  };
};

const OwnerDashboard = ({ summary, profilePercent, openReview, onReviewAutoOpened, onOpenReview }: RoleDashboardProps) => {
  const { data: listings = [], isLoading: listingsLoading } = useOwnerListings();
  const { atLimit, maxListings } = useListingAllowance();
  const { unreadCount } = useUnreadMessages();
  const { data: stories = [] } = useMySitStories();
  const guideTodo = useGuideTodo(listings[0]?.id);

  const current = summary?.current_sits.find((s) => s.role === "owner") ?? null;
  const next = summary?.next_sits.find((s) => s.role === "owner") ?? null;
  const applicantsByListing = new Map((summary?.new_applicants ?? []).map((a) => [a.listing_id, a.count]));
  const totalApplicants = (summary?.new_applicants ?? []).reduce((n, a) => n + a.count, 0);

  const todos = useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [];
    if (totalApplicants > 0) {
      items.push({ key: "applicants", icon: Users, label: `Review ${plural(totalApplicants, "new applicant")}`, to: "/applications" });
    }
    for (const story of stories.filter((s) => s.role === "owner" && s.status === "ready" && s.portfolio_status === "requested")) {
      items.push({
        key: `portfolio-${story.id}`,
        icon: BookHeart,
        label: `${story.other_first_name} would like to show your Sit Story on their profile`,
        to: `/stories/${story.id}`,
      });
    }
    if (guideTodo) items.push(guideTodo);
    const todayIso = new Date().toISOString().slice(0, 10);
    const needsDates = listings.find(
      (l) => l.status === "published" && !l.sit_dates.some((d) => d.status === "open" && d.end_date >= todayIso),
    );
    if (needsDates && !current && !next) {
      items.push({ key: "dates", icon: CalendarPlus, label: "Add new dates to find your next Nomad", to: `/edit-listing/${needsDates.id}?focus=dates` });
    }
    return [...items, ...commonTodos("owner", summary, unreadCount, profilePercent, onOpenReview)];
  }, [totalApplicants, stories, guideTodo, listings, current, next, summary, unreadCount, profilePercent, onOpenReview]);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="space-y-5">
        <NowCard role="owner" current={current} next={next} />
        <TodoList items={todos} />

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 px-1 font-display text-lg font-bold">
            <Home className="h-5 w-5 text-primary" aria-hidden="true" />
            {listings.length > 1 ? "Your homes" : "Your home"}
          </h2>
          {listingsLoading ? (
            <Skeleton className="h-48 w-full rounded-3xl" />
          ) : listings.length === 0 ? (
            <div className="rounded-3xl border border-dashed bg-card p-6 text-center">
              <Home className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
              <p className="font-medium">No listing yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Create your listing to find a Nomad for your pets.</p>
              <Button asChild className="mt-4 rounded-full">
                <Link to="/create-listing">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Listing
                </Link>
              </Button>
            </div>
          ) : (
            <>
              {listings.map((listing) => (
                <OwnerListingCard key={listing.id} listing={listing} newApplicants={applicantsByListing.get(listing.id) ?? 0} />
              ))}
              {!atLimit && maxListings > 1 && (
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link to="/create-listing">
                    <Plus className="mr-2 h-4 w-4" />
                    Add another home
                  </Link>
                </Button>
              )}
            </>
          )}
        </section>
      </div>

      <div className="space-y-5">
        <div id="your-sits" className="scroll-mt-24">
          <UpcomingPastSits viewAs="owner" openReview={openReview} onAutoOpened={onReviewAutoOpened} />
        </div>
        <SitStoriesSection role="owner" />
      </div>
    </div>
  );
};

export default Dashboard;
