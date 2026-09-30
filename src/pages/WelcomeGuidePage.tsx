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
import { NN_MAIN, RoleTheme } from "@/components/nn/ui";

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
    <RoleTheme role={isOwner ? "owner" : "sitter"} className="flex min-h-screen flex-col">
      <Navbar wide />
      <main className={NN_MAIN}>
        <button
          type="button"
          onClick={goBack}
          className="-ml-2 inline-flex h-11 items-center gap-2 self-start rounded-md px-2 text-[15px] font-semibold print-hidden hover:bg-[var(--nn-soft)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>

        {authLoading || listingLoading || !id ? (
          <Skeleton className="h-96 w-full rounded-[24px]" />
        ) : isOwner ? (
          <GuideEditor listingId={id} initialSection={initialSection} />
        ) : (
          <SitterGuideView listingId={id} />
        )}
      </main>
      <Footer />
    </RoleTheme>
  );
};

export default WelcomeGuidePage;
