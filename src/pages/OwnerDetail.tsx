import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { HiddenProfileNotice, NeverShownNote, PreviewBar, PreviewTip } from "@/components/profile/ProfilePreview";
import { BackButton } from "@/components/layout/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { publicProfiles } from "@/lib/publicProfile";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { BadgeCheck, Flag, Home, Loader2, Mail, MessageCircle, Phone, Star } from "lucide-react";
import { useStartConversation } from "@/hooks/useConversations";
import OwnerReviewsSummaryCard from "@/components/reviews/OwnerReviewsSummaryCard";
import { useOwnerAverageRating } from "@/hooks/useOwnerReviews";
import ReportDialog from "@/components/reports/ReportDialog";
import { useHideBottomNav } from "@/lib/bottomNav";
import { NN_PAGE, RoleTheme, SectionCard, StatusChip, nnButton, shortRange } from "@/components/nn/ui";
import { petLine } from "@/components/listing/ListingParts";
import { OWNER_PROFILE_COLUMNS } from "@/lib/profileColumns";
import { cn } from "@/lib/utils";

interface OwnerProfile {
  id: string;
  user_id: string;
  bio: string | null;
  is_active?: boolean | null;
}

interface Profile {
  first_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  founding_member: boolean | null;
  email_verified: boolean | null;
  phone_verified: boolean | null;
  id_verified: boolean | null;
}

interface Listing {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  photos: string[];
  status: string;
  pets: { id: string; name: string | null; type: string }[];
  sit_dates: { id: string; start_date: string; end_date: string; status: string }[];
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section aria-label={title} className="flex flex-col gap-3">
    <h2 className="font-display text-[22px] font-normal leading-tight">{title}</h2>
    {children}
  </section>
);

const Skeletons = () => (
  <RoleTheme role="sitter" className="flex min-h-screen flex-col">
    <Navbar wide />
    <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-4 pb-12 pt-20 md:pt-24")}>
      <Skeleton className="h-24 w-24 rounded-full" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full rounded-[22px]" />
    </main>
  </RoleTheme>
);

/** Pet Parent profile (design: ParentPublicPhone, ParentPublicTablet, ParentPublicDesktop). */
const OwnerDetail = () => {
  const { userId } = useParams();
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStartingChat, setIsStartingChat] = useState(false);

  const startConversation = useStartConversation();
  const ratingData = useOwnerAverageRating(userId);

  // Preview (your own profile, from the eye button): exactly what Nomads get,
  // plus owner-only tips while "Show tips" is on.
  const [searchParams] = useSearchParams();
  const preview = searchParams.get("preview") === "1" && !!user && user.id === userId;
  const [showTips, setShowTips] = useState(true);

  useEffect(() => {
    const fetchOwnerData = async () => {
      if (!userId || !user) {
        setLoading(false);
        return;
      }
      try {
        const [ownerResult, profileResult, listingsResult] = await Promise.all([
          supabase.from("owner_profiles").select(OWNER_PROFILE_COLUMNS as "*").eq("user_id", userId).maybeSingle(),
          publicProfiles("first_name, avatar_url, city, country, founding_member, email_verified, phone_verified, id_verified").eq("id", userId).maybeSingle(),
          supabase
            .from("listings")
            .select("id, title, city, country, photos, status, pets (id, name, type), sit_dates (id, start_date, end_date, status)")
            .eq("owner_user_id", userId)
            .eq("status", "published"),
        ]);
        if (ownerResult.error) throw ownerResult.error;
        if (profileResult.error) throw profileResult.error;
        if (listingsResult.error) throw listingsResult.error;
        setOwnerProfile(ownerResult.data as unknown as OwnerProfile | null);
        setProfile(profileResult.data as unknown as Profile | null);
        setListings((listingsResult.data || []) as Listing[]);
      } catch (error) {
        console.error("Error fetching owner:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to load this profile" });
      } finally {
        setLoading(false);
      }
    };
    fetchOwnerData();
  }, [userId, user]);

  const isOther = !!user && user.id !== userId;
  const canMessage = isOther && (role === "sitter" || role === "both");
  const showBar = !!profile && (canMessage || preview);
  useHideBottomNav(showBar);

  const name = profile?.first_name || "Pet Parent";
  const location = profile ? [profile.city, profile.country].filter(Boolean).join(", ") : null;

  // Only sits with open dates still to come count.
  const today = new Date().toISOString().slice(0, 10);
  const openSits = listings
    .map((l) => ({
      ...l,
      open: l.sit_dates.filter((d) => d.status === "open" && d.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date)),
    }))
    .filter((l) => l.open.length > 0);

  // AuthContext.loading starts true and user starts null until the session
  // check resolves — check it first so a genuinely signed-in member doesn't
  // briefly see the "sign in" wall while their session is still loading in.
  if (authLoading) return <Skeletons />;

  if (!user) {
    return (
      <RoleTheme role="sitter" className="flex min-h-screen flex-col">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex flex-1 flex-col items-center pb-12 pt-24")}>
          <div className="flex max-w-md flex-col items-center gap-3 rounded-[22px] border border-dashed border-border p-8 text-center">
            <h1 className="text-[20px] font-bold">Sign in to see this profile</h1>
            <p className="text-[15px] text-muted-foreground">Pet Parent profiles are for members only, to keep homes and families safe.</p>
            <Link to="/auth" className={nnButton("primary")}>
              Log in or join free
            </Link>
          </div>
        </main>
        <Footer />
      </RoleTheme>
    );
  }

  if (loading) return <Skeletons />;

  if (preview && (!profile || ownerProfile?.is_active === false)) {
    return (
      <RoleTheme role="owner" className="flex min-h-screen flex-col">
        <Navbar wide />
        <main className="flex-1 pt-16">
          <PreviewBar showTips={showTips} onToggleTips={() => setShowTips((v) => !v)} accent="teal" />
          <div className="mx-auto max-w-xl px-5 py-6">
            <HiddenProfileNotice
              text="Your Pet Parent profile is paused, so Nomads can't open it right now. Turn it back on in Settings to be seen."
              action={{ label: "Open Settings", to: "/settings/privacy" }}
            />
          </div>
        </main>
      </RoleTheme>
    );
  }

  if (!profile) {
    return (
      <RoleTheme role="sitter" className="flex min-h-screen flex-col">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex flex-1 flex-col items-center pb-12 pt-24")}>
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <h1 className="font-display text-[28px]">Pet Parent not found</h1>
            <p className="text-[15px] text-muted-foreground">This profile doesn't exist or may have been removed.</p>
            <Link to="/browse-sits" className={nnButton("primary")}>
              Browse Sits
            </Link>
          </div>
        </main>
        <Footer />
      </RoleTheme>
    );
  }

  const badge = (Icon: typeof BadgeCheck, label: string) => (
    <span className="inline-flex h-[26px] items-center gap-1 rounded-full bg-[var(--nn-ok-bg)] px-2.5 text-xs font-bold text-brand-teal-text">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );

  const messageOwner = async () => {
    setIsStartingChat(true);
    try {
      const { conversationId } = await startConversation.mutateAsync({ otherUserId: userId! });
      navigate(`/inbox?conversation=${conversationId}`);
    } catch (error) {
      toast({ variant: "destructive", title: "Couldn't open the chat", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsStartingChat(false);
    }
  };

  const messageButton = (className?: string) => (
    <button type="button" onClick={messageOwner} disabled={preview || isStartingChat} className={nnButton("primary", cn("h-[52px] w-full rounded-2xl text-[15px]", className))}>
      {isStartingChat ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
      Message {name}
    </button>
  );
  const previewNote = preview && <p className="text-sm text-muted-foreground">Nomads see this button. It's switched off in preview.</p>;

  const summary = (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4 md:flex-col md:items-center md:text-center">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-[#D8C3B0] md:h-32 md:w-32">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-[#5A4636]">{name.slice(0, 1)}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1 md:items-center">
          <h1 className="font-display text-[30px] font-normal leading-tight lg:text-[34px]">{name}</h1>
          <p className="text-[15px] text-muted-foreground">Pet Parent{location ? ` · ${location}` : ""}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 md:justify-center">
        {profile.founding_member && <StatusChip tone="gold">★ Founding Member</StatusChip>}
        {profile.id_verified && badge(BadgeCheck, "ID verified")}
        {profile.email_verified && badge(Mail, "Email")}
        {profile.phone_verified && badge(Phone, "Phone")}
      </div>
      <div className="flex items-center gap-3 rounded-[20px] border border-[var(--nn-border)] bg-card px-4 py-3 md:justify-center">
        {ratingData.reviewCount > 0 ? (
          <>
            <span className="text-[26px] font-bold">{ratingData.averageRating.toFixed(1)}</span>
            <span className="flex flex-col">
              <span className="flex gap-0.5" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={cn("h-4 w-4", s <= Math.round(ratingData.averageRating) ? "fill-[#E8B53E] text-[#E8B53E]" : "text-muted-foreground")} />
                ))}
              </span>
              <span className="text-sm text-muted-foreground">
                {ratingData.reviewCount} {ratingData.reviewCount === 1 ? "review" : "reviews"} from Nomads
              </span>
            </span>
          </>
        ) : (
          <span className="text-[15px] text-muted-foreground">No reviews from Nomads yet</span>
        )}
      </div>
      {showBar && (
        <div className="hidden flex-col gap-2 md:flex">
          {messageButton()}
          {previewNote}
        </div>
      )}
    </div>
  );

  return (
    <RoleTheme role="sitter" className="flex min-h-screen flex-col">
      <Navbar wide />
      <main className={cn("flex-1 pt-16", showBar ? "pb-32 md:pb-16" : "pb-16")}>
        {preview && <PreviewBar showTips={showTips} onToggleTips={() => setShowTips((v) => !v)} accent="teal" />}
        <div className={cn(NN_PAGE, "flex flex-col gap-5 pt-4 md:pt-8")}>
          {!preview && <BackButton fallback={user.id === userId ? "/dashboard" : "/browse-sits"} className="h-11 self-start" />}

          <div className="flex flex-col gap-6 md:grid md:grid-cols-[280px_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
            <SectionCard className="p-0 md:sticky md:top-24 md:p-5 max-md:border-0 max-md:bg-transparent">{summary}</SectionCard>

            <div className="flex min-w-0 flex-col gap-7">
              {preview && showTips && !ownerProfile?.bio && (
                <PreviewTip title="Your About is empty" text="A few lines about your pets and your home help Nomads feel at ease before they apply." action={{ label: "Add a bio", to: "/edit-owner-profile" }} />
              )}
              {preview && showTips && !profile.avatar_url && (
                <PreviewTip title="Add a profile photo" text="Nomads like to see who they'll be sitting for." action={{ label: "Add a photo", to: "/edit-owner-profile" }} />
              )}
              {preview && showTips && openSits.length === 0 && (
                <PreviewTip
                  title="Nomads can't apply yet"
                  text="Your home has no open dates, so it isn't showing in Browse. Add dates and Nomads can start applying."
                  action={{ label: "Add dates", to: "/dashboard" }}
                />
              )}

              {ownerProfile?.bio && (
                <Section title={`About ${name}`}>
                  <p className="whitespace-pre-line text-[16px] leading-relaxed">{ownerProfile.bio}</p>
                </Section>
              )}

              {openSits.length > 0 && (
                <Section title={`${name}'s sits`}>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {openSits.map((l) => (
                      <Link key={l.id} to={`/listing/${l.id}`} className="flex items-center gap-3 rounded-[20px] border border-[var(--nn-border)] bg-card p-3">
                        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#CDB79E]">
                          {l.photos?.[0] ? <img src={l.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Home className="h-8 w-8 text-[#8A7660]" aria-hidden="true" />}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="line-clamp-2 text-[16px] font-bold leading-snug">{l.title}</span>
                          {l.city && <span className="text-sm text-muted-foreground">{[l.city, l.country].filter(Boolean).join(", ")}</span>}
                          <span className="text-sm font-semibold">Next: {shortRange(l.open[0].start_date, l.open[0].end_date)}</span>
                          <span className="text-sm text-muted-foreground">
                            {[l.pets.length > 0 ? petLine(l.pets) : null, `${l.open.length} open ${l.open.length === 1 ? "date" : "dates"}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </Section>
              )}

              {userId && (
                <Section title="What Nomads say">
                  <OwnerReviewsSummaryCard ownerUserId={userId} />
                </Section>
              )}

              {isOther && (
                <ReportDialog
                  targetType="user"
                  targetId={userId!}
                  targetLabel="owner"
                  trigger={
                    <button type="button" className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-semibold text-muted-foreground underline underline-offset-2">
                      <Flag className="h-4 w-4" aria-hidden="true" />
                      Report this profile
                    </button>
                  }
                />
              )}

              {preview && (
                <NeverShownNote>
                  your last name, email, phone number or street address. A Nomad only gets the address and your Welcome Guide after you confirm them for a sit.
                </NeverShownNote>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Phone: Message stays at the bottom for Nomad and Combined viewers. */}
      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-1.5 border-t border-border bg-card px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden">
          {messageButton()}
          {previewNote}
        </div>
      )}

      <div className={cn(showBar && "hidden md:block")}>
        <Footer />
      </div>
    </RoleTheme>
  );
};

export default OwnerDetail;
