import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Home, Search, Plus, MessageSquare, Calendar, Settings, 
  LogOut, User, Briefcase, ArrowRight, MapPin, Clock,
  FileText, Star, Bell, ClipboardList, Heart
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import { useSitterApplications } from "@/hooks/useSitterApplications";
import { SitterApplicationCard } from "@/components/applications/SitterApplicationCard";
import { Skeleton } from "@/components/ui/skeleton";
import { SitsCalendar } from "@/components/dashboard/SitsCalendar";
import { OwnerListingCard } from "@/components/dashboard/OwnerListingCard";
import { useOwnerListings } from "@/hooks/useOwnerListings";
import UpgradeRoleDialog from "@/components/dashboard/UpgradeRoleDialog";

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

const Dashboard = () => {
  const { user, role, signOut, loading } = useAuth();
  const { activeRole, setActiveRole } = useActiveRole();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sitterProfile, setSitterProfile] = useState<SitterProfile | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

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
      
      <main className="pt-20 pb-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">
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
              <Button variant="outline" size="icon">
                <Bell className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon">
                <Settings className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </Button>
            </div>
          </div>

          {/* Role Toggle for combined users */}
          {role === "both" && (
            <div className="mb-8">
              <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as "sitter" | "owner")}>
                <TabsList className="grid w-full max-w-md grid-cols-2">
                  <TabsTrigger value="sitter" className="gap-2">
                    <Briefcase className="w-4 h-4" />
                    Sitter Mode
                  </TabsTrigger>
                  <TabsTrigger value="owner" className="gap-2">
                    <Home className="w-4 h-4" />
                    Owner Mode
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
            />
          )}

          {(activeRole === "owner" && (role === "owner" || role === "both")) && (
            <OwnerDashboard 
              profile={profile} 
              ownerProfile={ownerProfile} 
            />
          )}
        </div>
      </main>
    </div>
  );
};

const SitterDashboard = ({ 
  profile, 
  sitterProfile 
}: { 
  profile: Profile | null; 
  sitterProfile: SitterProfile | null; 
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Profile & Stats */}
      <div className="space-y-6">
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

            {/* Profile completion */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Profile completion</span>
                <span className="font-medium">{profileCompletion}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all" 
                  style={{ width: `${profileCompletion}%` }}
                />
              </div>
            </div>

            <Link to="/edit-sitter-profile">
              <Button className="w-full" variant="outline">
                <User className="w-4 h-4 mr-2" />
                Edit Profile
              </Button>
            </Link>
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
      <div className="lg:col-span-2 space-y-6">
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

        {/* Sits Calendar */}
        <SitsCalendar viewAs="sitter" />
      </div>
    </div>
  );
};

const OwnerDashboard = ({ 
  profile, 
  ownerProfile 
}: { 
  profile: Profile | null; 
  ownerProfile: OwnerProfile | null; 
}) => {
  const { data: listings = [], isLoading: listingsLoading } = useOwnerListings();

  const listingStats = {
    total: listings.length,
    published: listings.filter((l) => l.status === "published").length,
    draft: listings.filter((l) => l.status === "draft").length,
    applications: listings.reduce((acc, l) => acc + l._count.applications, 0),
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column */}
      <div className="space-y-6">
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
                <p className="text-sm text-muted-foreground">Pet Owner</p>
              </div>
            </div>

            <Link to="/edit-owner-profile">
              <Button className="w-full" variant="outline">
                <User className="w-4 h-4 mr-2" />
                Edit Profile
              </Button>
            </Link>
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
      <div className="lg:col-span-2 space-y-6">
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
                    <p className="text-sm text-muted-foreground">Find trusted sitters</p>
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
                <p className="text-sm mt-1">Create your first listing to find a sitter!</p>
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
            <div className="text-center py-8 text-muted-foreground">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No applications yet</p>
              <p className="text-sm mt-1">Applications for your listings will appear here</p>
            </div>
          </CardContent>
        </Card>

        {/* Sits Calendar */}
        <SitsCalendar viewAs="owner" />
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

export default Dashboard;
