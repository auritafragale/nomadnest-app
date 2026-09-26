import { useParams, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { GuideEditor } from "@/components/welcome-guide/GuideEditor";
import { SitterGuideView } from "@/components/welcome-guide/SitterGuideView";
import { GUIDE_SECTIONS, type GuideSection } from "@/lib/welcomeGuide";
import { ArrowLeft } from "lucide-react";

/**
 * /listing/:id/welcome-guide
 * Owner: the sectioned editor (?section=access opens that section).
 * Anyone else: the sitter view, which only shows what get_sitter_guide allows.
 */
const WelcomeGuidePage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const { data: listing, isLoading: listingLoading } = useQuery({
    queryKey: ["welcome-guide-listing", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("listings")
        .select("id, title, owner_user_id")
        .eq("id", id!)
        .maybeSingle();
      return data as { id: string; title: string; owner_user_id: string } | null;
    },
    enabled: !!id,
  });

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  const isOwner = !!user && !!listing && listing.owner_user_id === user.id;
  const sectionParam = searchParams.get("section");
  const initialSection = GUIDE_SECTIONS.some((s) => s.key === sectionParam) ? (sectionParam as GuideSection) : null;

  // Going back must land on the listing without the guide staying in history
  // (a pushed link made the phone's back button reopen the guide).
  // Links from the listing page pass { from: "/listing/:id" } in their state.
  const cameFromListing = (location.state as { from?: string } | null)?.from === `/listing/${id}`;
  const goBack = () => {
    if (cameFromListing) navigate(-1);
    else navigate(id ? `/listing/${id}` : "/browse-sits", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-20 container max-w-3xl px-4 py-8">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-5 print-hidden hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to listing
        </button>

        {authLoading || listingLoading || !id ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : isOwner ? (
          <GuideEditor listingId={id} initialSection={initialSection} />
        ) : (
          <SitterGuideView listingId={id} />
        )}
      </main>
      <Footer />
    </div>
  );
};

export default WelcomeGuidePage;
