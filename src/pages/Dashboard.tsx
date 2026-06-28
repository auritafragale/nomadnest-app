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
import MembershipStatusCard from "@/components/dashboard/MembershipStatusCard";
import MobileHomeScreen from "@/components/mobile/MobileHomeScreen";
import { SitterAvailabilityCalendar } from "@/components/dashboard/SitterAvailabilityCalendar";
import { UpcomingPastSits } from "@/components/dashboard/UpcomingPastSits";

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

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

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
        <div className="container mx-auto px-4">
          <Breadcrumbs />
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                Welcome back, {displayName}!
              </h1>
              <p className="text-muted-foreground mt-1">
                {profile?.city && profile?.country 
                  ? `${profile.city}, ${profile.country}` 
                  : "Complete your profile to get better matches"
                }
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Link to="/settings">
                <Button variant="outline" size="icon">
                  <Settings className="w-4 h-4" />
                </Button>
              </Link>
              <Button variant="outline" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </Button>
            </div>
          </div>

          {/* Role Toggle for combined users */}
          {role === "both" && (
            <div className="mb-8 hidden md:block">
              <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as "sitter" | "owner")}>
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

  const applicationStats = {
    total: applications.length,
    pending: applications.filter((a) => a.status === "applied").length,
    shortlisted: applications.filter((a) => a.status === "shortlisted").length,
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

        {/* Membership Status */}
        <MembershipStatusCard />

        {/* Profile Card */}
        <Card variant="elevated">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Avatar"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-primary" />
                )}
              </div>
              <div>
                <h3 className="font-semibold">
                  {profile?.first_name} {profile?.last_name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {sitterProfile?.headline || "Add a headline to stand out"}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Link to="/edit-sitter-profile" className="flex-1">
                <Button className="w-full">
                  <User className="w-4 h-4 mr-2" />
                  Edit Sitter Profile
                </Button>
              </Link>
              <Link to={`/sitter/${userId}`}>
                <Button variant="ghost" size="icon" title="View as others see it">
                  <Eye className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Your stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Applications sent</span>
              <Badge variant="secondary">{applicationStats.total}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Shortlisted</span>
              <Badge variant="secondary">{applicationStats.shortlisted}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Accepted</span>
              <Badge variant="secondary">{applicationStats.accepted}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Column - Actions & Applications */}
      <div className="md:col-span-1 lg:col-span-2 space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to="/browse-sits">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Search className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Browse Sits</h3>
                    <p className="text-sm text-muted-foreground">Find your next adventure</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/saved">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Heart className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Saved Sits</h3>
                    <p className="text-sm text-muted-foreground">Your favorites</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/inbox">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Messages</h3>
                    <p className="text-sm text-muted-foreground">View inbox</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* My Applications */}
        <Card>
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
            {applicationsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ) : applications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No applications yet</p>
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
                {applications.slice(0, 5).map((application) => (
                  <SitterApplicationCard key={application.id} application={application} />
                ))}
                {applications.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    And {applications.length - 5} more applications...
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
  const { data: applications = [], isLoading: applicationsLoading } = useOwnerApplications();
  const profileCompletion = calculateOwnerProfileCompletion(profile, ownerProfile);

  const listingStats = {
    total: listings.length,
    published: listings.filter((l) => l.status === "published").length,
    draft: listings.filter((l) => l.status === "draft").length,
    applications: listings.reduce((acc, l) => acc + l._count.applications, 0),
  };

  const pendingApplications = applications.filter(
    (a) => a.status === "applied" || a.status === "shortlisted"
  );

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

        {/* Membership Status */}
        <MembershipStatusCard />

        {/* Profile Card */}
        <Card variant="elevated">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Avatar"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-secondary" />
                )}
              </div>
              <div>
                <h3 className="font-semibold">
                  {profile?.first_name} {profile?.last_name}
                </h3>
                <p className="text-sm text-muted-foreground">Pet Parent</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Link to="/edit-owner-profile" className="flex-1">
                <Button className="w-full">
                  <User className="w-4 h-4 mr-2" />
                  Edit Pet Parent Profile
                </Button>
              </Link>
              <Link to={`/owner/${userId}`}>
                <Button variant="ghost" size="icon" title="View as others see it">
                  <Eye className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Your stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Active listings</span>
              <Badge variant="secondary">{listingStats.published}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Draft listings</span>
              <Badge variant="secondary">{listingStats.draft}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Applications received</span>
              <Badge variant="secondary">{listingStats.applications}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Column */}
      <div className="md:col-span-1 lg:col-span-2 space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/create-listing">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Plus className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Create Listing</h3>
                    <p className="text-sm text-muted-foreground">Post a new sit opportunity</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link to="/browse-sitters">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <Search className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Browse Sitters</h3>
                    <p className="text-sm text-muted-foreground">Find trusted nomads</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground ml-auto" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

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

        {/* Applications Received */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                Applications Received
                {pendingApplications.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {pendingApplications.length} pending
                  </Badge>
                )}
              </CardTitle>
            </div>
            <Link to="/applications">
              <Button variant="outline" size="sm">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {applicationsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : applications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No applications yet</p>
                <p className="text-sm mt-1">Applications for your listings will appear here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {applications.slice(0, 5).map((application) => (
                  <OwnerApplicationPreviewCard key={application.id} application={application} />
                ))}
                {applications.length > 5 && (
                  <Link to="/applications" className="block">
                    <p className="text-sm text-primary text-center pt-2 hover:underline">
                      View {applications.length - 5} more applications
                    </p>
                  </Link>
                )}
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
