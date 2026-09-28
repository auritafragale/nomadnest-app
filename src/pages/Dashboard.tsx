import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  BookHeart,
  BookOpen,
  Bell,
  CalendarPlus,
  FileText,
  Home,
  Mail,
  MessageSquare,
  PawPrint,
  Plus,
  Star,
  User,
  Users,
  X,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile } from "@/lib/myProfile";
import Navbar from "@/components/layout/Navbar";
import { useSitterApplications } from "@/hooks/useSitterApplications";
import { SitterApplicationCard } from "@/components/applications/SitterApplicationCard";
import { Skeleton } from "@/components/ui/skeleton";
import { OwnerListingCard } from "@/components/dashboard/OwnerListingCard";
import { useOwnerListings } from "@/hooks/useOwnerListings";
import { useListingAllowance } from "@/hooks/useListingAllowance";
import { SitterInvitesSection } from "@/components/invites/SitterInvitesSection";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { SitterAvailabilityCalendar } from "@/components/dashboard/SitterAvailabilityCalendar";
import { UpcomingPastSits } from "@/components/dashboard/UpcomingPastSits";
import { NowCard } from "@/components/dashboard/NowCard";
import { TodoList, type TodoItem } from "@/components/dashboard/TodoList";
import { SitStoriesSection } from "@/components/dashboard/SitStoriesSection";
import { useDashboardSummary, type DashboardSummary } from "@/hooks/useDashboardSummary";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useGuideCompletion } from "@/hooks/useWelcomeGuide";
import { useMySitStories } from "@/hooks/useSitStories";

interface Profile {
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  country: string | null;
  city: string | null;
}

interface SitterProfile {
  headline: string | null;
  bio: string | null;
  pet_types: string[] | null;
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

  // Deep link from a review reminder: land a combined member in the correct
  // mode first, then let the matching SitCard auto-open its review dialog.
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
      const { data: profileData } = await fetchMyProfile();
      if (profileData) setProfile(profileData);

      if (role === "sitter" || role === "both") {
        const { data: sitterData } = await supabase
          .from("sitter_profiles")
          .select("headline, bio, pet_types")
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const displayName = profile?.first_name || user?.email?.split("@")[0] || "there";
  const viewRole: "sitter" | "owner" =
    role === "both" ? (activeRole === "owner" ? "owner" : "sitter") : role === "owner" ? "owner" : "sitter";
  const profilePercent =
    viewRole === "sitter"
      ? calculateSitterProfileCompletion(profile, sitterProfile)
      : calculateOwnerProfileCompletion(profile, ownerProfile);

  // A review reminder opened from the to-do list: open it on its sit card.
  const openReview = (sitId: string) => {
    setOpenReviewSitId(sitId);
    window.setTimeout(() => {
      document.getElementById("your-sits")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  return (
    <div className="min-h-screen bg-background">
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
            <Button size="sm" variant="secondary" className="h-7 text-xs" disabled={pushLoading} onClick={subscribe}>
              Enable
            </Button>
            <button
              onClick={dismissPushBanner}
              className="text-primary-foreground/70 hover:text-primary-foreground"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className={`pb-24 md:pb-12 ${showPushBanner ? "pt-32" : "pt-20 md:pt-24"}`}>
        <div className="container mx-auto max-w-6xl px-4">
          <DashboardHeader
            role={viewRole}
            userId={user?.id || ""}
            displayName={displayName}
            avatarUrl={profile?.avatar_url}
            city={profile?.city}
            country={profile?.country}
            profilePercent={profilePercent}
            canSwitchRole={role === "both"}
            onSwitchRole={setActiveRole}
          />

          {viewRole === "sitter" ? (
            <SitterDashboard
              summary={summary}
              profilePercent={profilePercent}
              openReview={openReviewSitId}
              onReviewAutoOpened={handleReviewAutoOpened}
              onOpenReview={openReview}
            />
          ) : (
            <OwnerDashboard
              summary={summary}
              profilePercent={profilePercent}
              openReview={openReviewSitId}
              onReviewAutoOpened={handleReviewAutoOpened}
              onOpenReview={openReview}
            />
          )}
        </div>
      </main>
    </div>
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

const SitterDashboard = ({ summary, profilePercent, openReview, onReviewAutoOpened, onOpenReview }: RoleDashboardProps) => {
  const { data: applications = [], isLoading: applicationsLoading } = useSitterApplications();
  const { unreadCount } = useUnreadMessages();
  const [dashParams] = useSearchParams();
  const initialAppTab = dashParams.get("appTab");
  const [appTab, setAppTab] = useState<"all" | "accepted" | "pending" | "past" | "cancelled">(
    initialAppTab === "cancelled" || initialAppTab === "accepted" || initialAppTab === "pending" || initialAppTab === "past"
      ? initialAppTab
      : "all",
  );

  // Deep links (e.g. from an "Application Accepted" notification) land on the list.
  useEffect(() => {
    if (!initialAppTab) return;
    const t = setTimeout(() => {
      document.getElementById("my-applications")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => clearTimeout(t);
  }, [initialAppTab]);

  // Deep link from an invite notification: land on the Invites section.
  const section = dashParams.get("section");
  useEffect(() => {
    if (section !== "invites") return;
    const t = setTimeout(() => {
      document.getElementById("sitter-invites")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => clearTimeout(t);
  }, [section]);

  const todayISO = new Date().toISOString().slice(0, 10);
  // One cancelled row per date range (the most recent attempt), display only.
  const seenCancelledDates = new Set<string>();
  const visibleApplications = applications
    .filter((a) => {
      if (appTab === "cancelled") {
        if (a.status !== "cancelled") return false;
        if (seenCancelledDates.has(a.sit_dates_id)) return false;
        seenCancelledDates.add(a.sit_dates_id);
        return true;
      }
      const ended = !!a.sit_dates?.end_date && a.sit_dates.end_date < todayISO;
      if (appTab === "accepted") return a.status === "accepted" && !ended;
      if (appTab === "past") return a.status === "accepted" && ended;
      if (appTab === "pending") return a.status === "applied" || a.status === "shortlisted";
      if (appTab === "all") return a.status !== "cancelled";
      return true;
    })
    .sort((a, b) => (a.sit_dates?.start_date ?? "").localeCompare(b.sit_dates?.start_date ?? ""));
  const pendingCount = applications.filter((a) => a.status === "applied").length;

  const current = summary?.current_sits.find((s) => s.role === "sitter") ?? null;
  const next = summary?.next_sits.find((s) => s.role === "sitter") ?? null;

  const todos = useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [];
    for (const sit of (summary?.current_sits ?? []).filter((s) => s.role === "sitter" && s.due_today && !s.sent_today)) {
      items.push({ key: `update-${sit.sit_id}`, icon: PawPrint, label: `Send today's update to ${sit.other_first_name}`, to: `/sits/${sit.sit_id}` });
    }
    if ((summary?.pending_invites ?? 0) > 0) {
      items.push({
        key: "invites",
        icon: Mail,
        label: `Reply to ${plural(summary!.pending_invites, "invite")}`,
        onClick: () => document.getElementById("sitter-invites")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      });
    }
    return [...items, ...commonTodos("sitter", summary, unreadCount, profilePercent, onOpenReview)];
  }, [summary, unreadCount, profilePercent, onOpenReview]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        <NowCard role="sitter" current={current} next={next} />
        <TodoList items={todos} />

        <section id="my-applications" className="scroll-mt-24 rounded-3xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 px-1">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="font-display text-lg font-bold">My applications</h2>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          <Tabs value={appTab} onValueChange={(v) => setAppTab(v as typeof appTab)} className="my-3">
            <TabsList className="w-full justify-start flex-nowrap overflow-x-auto overflow-y-hidden">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="accepted">Accepted</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>
          {applicationsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : visibleApplications.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              <p className="font-medium">No applications here yet</p>
              <Button asChild className="mt-3 rounded-full">
                <Link to="/browse-sits">
                  Browse sits
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleApplications.slice(0, 5).map((application) => (
                <SitterApplicationCard key={application.id} application={application} />
              ))}
              {visibleApplications.length > 5 && (
                <p className="pt-1 text-center text-sm text-muted-foreground">
                  And {plural(visibleApplications.length - 5, "more application")}
                </p>
              )}
            </div>
          )}
        </section>

        <div id="sitter-invites" className="scroll-mt-24">
          <SitterInvitesSection />
        </div>
      </div>

      <div className="space-y-5 lg:col-span-2">
        <div id="your-sits" className="scroll-mt-24">
          <UpcomingPastSits viewAs="sitter" openReview={openReview} onAutoOpened={onReviewAutoOpened} />
        </div>
        <SitStoriesSection role="sitter" />
        <SitterAvailabilityCalendar />
      </div>
    </div>
  );
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
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
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

      <div className="space-y-5 lg:col-span-2">
        <div id="your-sits" className="scroll-mt-24">
          <UpcomingPastSits viewAs="owner" openReview={openReview} onAutoOpened={onReviewAutoOpened} />
        </div>
        <SitStoriesSection role="owner" />
      </div>
    </div>
  );
};

function calculateSitterProfileCompletion(profile: Profile | null, sitterProfile: SitterProfile | null): number {
  let completed = 0;
  const total = 8;

  if (profile?.first_name) completed++;
  if (profile?.last_name) completed++;
  if (profile?.avatar_url) completed++;
  if (profile?.city) completed++;
  if (profile?.country) completed++;
  if (sitterProfile?.headline) completed++;
  if (sitterProfile?.bio) completed++;
  if (sitterProfile?.pet_types && sitterProfile.pet_types.length > 0) completed++;

  return Math.round((completed / total) * 100);
}

function calculateOwnerProfileCompletion(profile: Profile | null, ownerProfile: OwnerProfile | null): number {
  let completed = 0;
  const total = 6;

  if (profile?.first_name) completed++;
  if (profile?.last_name) completed++;
  if (profile?.avatar_url) completed++;
  if (profile?.city) completed++;
  if (profile?.country) completed++;
  if (ownerProfile?.bio) completed++;

  return Math.round((completed / total) * 100);
}

export default Dashboard;
