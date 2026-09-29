import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile } from "@/lib/myProfile";
import Navbar from "@/components/layout/Navbar";
import DashboardHeader, { ModeSwitch } from "@/components/dashboard/DashboardHeader";
import { NomadDashboard } from "@/components/nomad/NomadDashboard";
import { ParentDashboard } from "@/components/parent/ParentDashboard";
import { NN_PAGE, RoleTheme } from "@/components/nn/ui";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
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
  const header = (
    <DashboardHeader
      role={viewRole}
      userId={user?.id || ""}
      displayName={displayName}
      avatarUrl={profile?.avatar_url}
      city={profile?.city}
      country={profile?.country}
      completion={completion}
      modeSwitch={role === "both" ? <ModeSwitch role={viewRole} onChange={setActiveRole} /> : undefined}
    />
  );

  return (
    <RoleTheme role={viewRole} className="min-h-screen">
      <Navbar wide />

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
        <div className={NN_PAGE}>
          {viewRole === "sitter" ? (
            <NomadDashboard
              header={header}
              summary={summary}
              completion={completion}
              openReviewSitId={openReviewSitId}
              onReviewHandled={handleReviewAutoOpened}
            />
          ) : (
            <ParentDashboard
              header={header}
              summary={summary}
              completion={completion}
              openReview={openReviewSitId}
              onReviewAutoOpened={handleReviewAutoOpened}
            />
          )}
        </div>
      </main>
    </RoleTheme>
  );
};

export default Dashboard;
