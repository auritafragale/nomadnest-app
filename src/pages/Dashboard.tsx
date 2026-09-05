import { useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Home, Search, Plus, MessageSquare, Calendar, Settings,
  LogOut, User, Briefcase, ArrowRight, MapPin, Clock,
  FileText, Star, ClipboardList, Heart, Eye, Bell, X
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { useSitterApplications } from "@/hooks/useSitterApplications";
import { SitterApplicationCard } from "@/components/applications/SitterApplicationCard";
import { Skeleton } from "@/components/ui/skeleton";

import { OwnerListingCard } from "@/components/dashboard/OwnerListingCard";
import { useOwnerListings } from "@/hooks/useOwnerListings";
import UpgradeRoleDialog from "@/components/dashboard/UpgradeRoleDialog";
import { SitterInvitesSection } from "@/components/invites/SitterInvitesSection";

import { ProfileCompletenessCard } from "@/components/dashboard/ProfileCompletenessCard";
import { useOwnerApplications } from "@/hooks/useApplications";
import { OwnerApplicationPreviewCard } from "@/components/dashboard/OwnerApplicationPreviewCard";

import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import MobileHomeScreen from "@/components/mobile/MobileHomeScreen";
import { SitterAvailabilityCalendar } from "@/components/dashboard/SitterAvailabilityCalendar";
import { UpcomingPastSits } from "@/components/dashboard/UpcomingPastSits";
import StatsTabsCard from "@/components/dashboard/StatsTabsCard";
import OwnerWelcomeGuideCard from "@/components/dashboard/OwnerWelcomeGuideCard";

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

const Dashboard = () => {
  const { user, role, signOut, loading } = useAuth();
  const { activeRole, setActiveRole } = useActiveRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sitterProfile, setSitterProfile] = useState<SitterProfile | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const { isSupported, isSubscribed, isLoading: pushLoading, subscribe } = usePushNotifications();
  const [pushBannerDismissed, setPushBannerDismissed] = useState(
    () => localStorage.getItem(PUSH_BANNER_DISMISSED_KEY) === "true"
  );

  const dismissPushBanner = () => {
    localStorage.setItem(PUSH_BANNER_DISMISSED_KEY, "true");
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

  useEffect(() => {
    const fetchProfiles = async () => {
      if (!user) return;

      // Fetch main profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url, country, city")
        .eq("id", user.id)
        .maybeSingle();
      
      if (profileData) setProfile(profileData);

      // Fetch sitter profile if applicable
      if (role === "sitter" || role === "both") {
        const { data: sitterData } = await supabase
          .from("sitter_profiles")
          .select("headline, bio, pet_types")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (sitterData) setSitterProfile(sitterData);
      }

      // Fetch owner profile if applicable
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

  const displayName = profile?.first_name || user?.email?.split("@")[0] || "User";

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
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={pushLoading}
              onClick={subscribe}
            >
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

      {/* Mobile home — map + role toggle + FAB */}
      <div className={showPushBanner ? "pt-28" : "pt-16"}>
        <MobileHomeScreen />
      </div>

      <main className={`pb-12 ${showPushBanner ? "pt-16 md:pt-32" : "pt-4 md:pt-20"}`}>
        <div className="container mx-auto px-3 sm:px-4 max-w-full">
          <Breadcrumbs />
          <DashboardHeader
            role={activeRole === "owner" ? "owner" : "sitter"}
            userId={user?.id || ""}
            displayName={displayName}
            avatarUrl={profile?.avatar_url}
            city={profile?.city}
            country={profile?.country}
          />

          {/* Role Toggle for combined users */}
          {role === "both" && (
            <div className="mb-8 hidden md:block">
              <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as "sitter" | "owner")}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Switch mode</span>
                  <HelpTooltip
                    label="About switching modes"
                    content="Switching changes which listings, applications, and invites you see. Nomad Mode shows sits you can apply for; Pet Parent Mode shows your listings and incoming applications."
                  />
                </div>
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="sitter" className="gap-2">
                    <Briefcase className="w-4 h-4" />
                    Nomad Mode
                  </TabsTrigger>
                  <TabsTrigger value="owner" className="gap-2">
                    <Home className="w-4 h-4" />
                    Pet Parent Mode
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* Upgrade role option for single-role users */}
          {(role === "sitter" || role === "owner") && (
            <div className="mb-8">
              <UpgradeRoleDialog currentRole={role} />
            </div>
          )}

          {/* Dashboard Content */}
          {(activeRole === "sitter" && (role === "sitter" || role === "both")) && (
            <SitterDashboard 
              profile={profile} 
              sitterProfile={sitterProfile}
              userId={user?.id || ""}
            />
          )}

          {(activeRole === "owner" && (role === "owner" || role === "both")) && (
            <OwnerDashboard 
              profile={profile} 
              ownerProfile={ownerProfile}
              userId={user?.id || ""}
            />
          )}
        </div>
      </main>
    </div>
  );
};

const SitterDashboard = ({ 
  profile, 
  sitterProfile,
  userId
}: { 
  profile: Profile | null; 
  sitterProfile: SitterProfile | null;
  userId: string;
}) => {
  const profileCompletion = calculateSitterProfileCompletion(profile, sitterProfile);
  const { data: applications = [], isLoading: applicationsLoading } = useSitterApplications();
  const [dashParams] = useSearchParams();
  const initialAppTab = dashParams.get("appTab");
  const [appTab, setAppTab] = useState<"all" | "accepted" | "pending" | "completed" | "cancelled">(
    initialAppTab === "cancelled" ||
      initialAppTab === "accepted" ||
      initialAppTab === "pending" ||
      initialAppTab === "completed"
      ? initialAppTab
      : "all",
  );

  // Deep links (e.g. from an "Application Accepted" notification) land on the list.
  useEffect(() => {
    if (!initialAppTab) return;
    const t = setTimeout(() => {
      document
        .getElementById("my-applications")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => clearTimeout(t);
  }, [initialAppTab]);

  const todayISO = new Date().toISOString().slice(0, 10);
  const visibleApplications = applications.filter((a) => {
    const ended = !!a.sit_dates?.end_date && a.sit_dates.end_date < todayISO;
    if (appTab === "accepted") return a.status === "accepted" && !ended;
    if (appTab === "pending") return a.status === "applied" || a.status === "shortlisted";
    if (appTab === "completed") return a.status === "accepted" && ended;
    if (appTab === "cancelled") return a.status === "cancelled";
    if (appTab === "all") return a.status !== "cancelled";
    return true;
  });
  const showApplications = (tab: "all" | "accepted" | "pending" | "completed" | "cancelled") => {
    setAppTab(tab);
    document.getElementById("my-applications")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applicationStats = {
    total: applications.filter((a) => a.status !== "cancelled").length,
    pending: applications.filter((a) => a.status === "applied").length,
    accepted: applications.filter((a) => a.status === "accepted").length,
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Left Column - Profile & Stats */}
      <div className="space-y-6">
        {/* Profile Completeness */}
        <ProfileCompletenessCard
          role="sitter"
          profile={profile}
          sitterProfile={sitterProfile}
        />

        {/* Membership details live on the Membership page; the header shows status pills */}

        {/* Quick Stats — tabbed */}
        <StatsTabsCard
          tabs={[
            {
              id: "applications",
              label: "Applications",
              count: applicationStats.total,
              items: [
                { label: "Applications sent", value: applicationStats.total, to: "/dashboard#my-applications" },
                { label: "Awaiting reply", value: applicationStats.pending, to: "/dashboard#my-applications" },
                { label: "Accepted", value: applicationStats.accepted, to: "/dashboard#my-applications" },
              ],
            },
          ]}
        />
      </div>

      {/* Middle Column - Actions & Applications */}
      <div className="md:col-span-1 lg:col-span-2 space-y-6">
        {/* Saved Sits lives in the header actions, so no duplicate card here */}


        {/* My Applications */}
        <Card id="my-applications">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              My Applications
              {applicationStats.pending > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {applicationStats.pending} pending
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Track your sit applications</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={appTab} onValueChange={(v) => setAppTab(v as typeof appTab)} className="mb-4">
              <TabsList className="w-full justify-start flex-nowrap overflow-x-auto overflow-y-hidden">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="accepted">Accepted</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
              </TabsList>
            </Tabs>
            {applicationsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ) : visibleApplications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No applications here yet</p>
                <p className="text-sm mt-1">Start browsing sits to apply!</p>
                <Link to="/browse-sits">
                  <Button className="mt-4">
                    Browse Sits
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleApplications.slice(0, 5).map((application) => (
                  <SitterApplicationCard key={application.id} application={application} />
                ))}
                {visibleApplications.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    And {visibleApplications.length - 5} more applications...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sitter Invites */}
        <SitterInvitesSection />

        {/* Availability Calendar */}
        <SitterAvailabilityCalendar />

        {/* Upcoming & Past Sits */}
        <UpcomingPastSits viewAs="sitter" />

      </div>
    </div>
  );
};

const OwnerDashboard = ({ 
  profile, 
  ownerProfile,
  userId
}: { 
  profile: Profile | null; 
  ownerProfile: OwnerProfile | null;
  userId: string;
}) => {
  const { data: listings = [], isLoading: listingsLoading } = useOwnerListings();
  const profileCompletion = calculateOwnerProfileCompletion(profile, ownerProfile);

  const listingStats = {
    total: listings.length,
    published: listings.filter((l) => l.status === "published").length,
    draft: listings.filter((l) => l.status === "draft").length,
    applications: listings.reduce((acc, l) => acc + l._count.applications, 0),
  };



  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Left Column */}
      <div className="space-y-6">
        {/* Profile Completeness */}
        <ProfileCompletenessCard
          role="owner"
          profile={profile}
          ownerProfile={ownerProfile}
        />

        {/* Membership details live on the Membership page; the header shows status pills */}

        {/* Welcome Guide — one reusable guide per Pet Parent */}
        <OwnerWelcomeGuideCard />

        {/* Quick Stats — tabbed */}
        <StatsTabsCard
          tabs={[
            {
              id: "listings",
              label: "Listings",
              count: listingStats.total,
              items: [
                { label: "Active listings", value: listingStats.published, to: "/dashboard#my-listings" },
                { label: "Draft listings", value: listingStats.draft, to: "/dashboard#my-listings" },
              ],
            },
            {
              id: "applications",
              label: "Applications",
              count: listingStats.applications,
              items: [
                { label: "Applications received", value: listingStats.applications, to: "/applications" },
              ],
            },
          ]}
        />
      </div>

      {/* Middle Column */}
      <div className="md:col-span-1 lg:col-span-2 space-y-6">
        {/* My Listings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="w-5 h-5" />
              My Listings
              {listingStats.total > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {listingStats.total} total
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Manage your sit opportunities</CardDescription>
          </CardHeader>
          <CardContent>
            {listingsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))}
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Home className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No listings yet</p>
                <p className="text-sm mt-1">Create your first listing to find a nomad!</p>
                <Link to="/create-listing">
                  <Button className="mt-4">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Listing
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {listings.map((listing) => (
                  <OwnerListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>



        {/* Upcoming & Past Sits */}
        <UpcomingPastSits viewAs="owner" />

      </div>
    </div>
  );
};

function calculateSitterProfileCompletion(
  profile: Profile | null, 
  sitterProfile: SitterProfile | null
): number {
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

function calculateOwnerProfileCompletion(
  profile: Profile | null, 
  ownerProfile: OwnerProfile | null
): number {
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
