import { Helmet } from "react-helmet-async";
import { SitterPortfolio } from "@/components/sitter/SitterPortfolio";
import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { HiddenProfileNotice, NeverShownNote, PreviewBar, PreviewTip } from "@/components/profile/ProfilePreview";
import { useSitterFreeDates } from "@/hooks/useMyAvailability";
import { useSitterPortfolio } from "@/hooks/useSitStories";
import { NN_PAGE, RoleTheme, SectionCard, StatusChip, nnButton, shortRange } from "@/components/nn/ui";
import { BackButton } from "@/components/layout/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { publicProfiles } from "@/lib/publicProfile";
import { useAuth } from "@/contexts/AuthContext";
import { useReviewRate } from "@/hooks/useReviewRates";
import { useCommunityWarning } from "@/hooks/useCommunityWarning";
import CommunityWarningModal from "@/components/trust/CommunityWarningModal";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { BadgeCheck, ChevronRight, Flag, Loader2, Mail, MessageCircle, Phone, Send, ShieldCheck, Star } from "lucide-react";
import { useStartConversation } from "@/hooks/useConversations";
import SitterReviewsSummaryCard from "@/components/reviews/SitterReviewsSummaryCard";
import { useSitterAverageRating } from "@/hooks/useSitterReviews";
import ReportDialog from "@/components/reports/ReportDialog";
import { ShareDialog } from "@/components/share/ShareDialog";
import { PhotoLightbox } from "@/components/profile/PhotoLightbox";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import InvitePanel, { type InviteListing } from "@/components/sitter/InvitePanel";
import { useHideBottomNav } from "@/lib/bottomNav";
import { SITTER_PROFILE_COLUMNS } from "@/lib/profileColumns";
import { formatPetType, dedupePetTypes } from "@/lib/petTypes";
import { cn } from "@/lib/utils";

interface SitterProfile {
  id: string;
  user_id: string;
  headline: string | null;
  bio: string | null;
  why_i_sit: string | null;
  experience_level: string | null;
  experience_details: string | null;
  languages: string[];
  pet_types: string[];
  comfortable_with: string[];
  sit_style: string | null;
  home_preferences: string[];
  availability_type: string | null;
  available_from: string | null;
  available_to: string | null;
  preferred_regions: string[];
  preferred_countries: string[];
  preferred_cities: string[];
  id_verified: boolean;
  background_check: boolean;
  gallery: string[];
}

interface Profile {
  first_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  founding_member: boolean | null;
  email_verified: boolean | null;
  phone_verified: boolean | null;
}

const MAX_PETS = 4;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

const Section = ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) => (
  <section aria-label={title} className={cn("flex flex-col gap-3", className)}>
    <h2 className="font-display text-[22px] font-normal leading-tight">{title}</h2>
    {children}
  </section>
);

const Skeletons = () => (
  <RoleTheme role="owner" className="flex min-h-screen flex-col">
    <Navbar wide />
    <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-4 pb-12 pt-20 md:pt-24")}>
      <Skeleton className="h-24 w-24 rounded-full" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-5 w-72" />
      <Skeleton className="h-40 w-full rounded-[22px]" />
    </main>
  </RoleTheme>
);

/** Nomad profile (design: NomadPublicPhone, NomadPublicTablet, NomadPublicDesktopDark). */
const SitterDetail = () => {
  const { userId } = useParams();
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [sitter, setSitter] = useState<SitterProfile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<InviteListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<number>(0);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const { rate: reviewRate } = useReviewRate(userId);
  const nomadWarning = useCommunityWarning("user", userId);
  const [warningOpen, setWarningOpen] = useState(false);
  const isOther = !!user && user.id !== userId;
  const isPetParentViewer = isOther && (role === "owner" || role === "both");

  // Preview (your own profile, opened with the eye button): the same data
  // other members get, plus owner-only tips while "Show tips" is on.
  const [searchParams] = useSearchParams();
  const preview = searchParams.get("preview") === "1" && !!user && user.id === userId;
  const [showTips, setShowTips] = useState(true);
  const [ownVisibility, setOwnVisibility] = useState<{ is_visible: boolean; is_active: boolean } | null>(null);
  const { data: freeDates } = useSitterFreeDates(user ? userId : undefined);
  const { data: portfolio = [] } = useSitterPortfolio(user ? userId : undefined);
  useEffect(() => {
    if (!preview || !userId) return;
    supabase
      .from("sitter_profiles")
      .select("is_visible, is_active")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setOwnVisibility(data ? { is_visible: !!data.is_visible, is_active: !!data.is_active } : null));
  }, [preview, userId]);
  const hiddenFromMembers = preview && !!ownVisibility && !(ownVisibility.is_visible && ownVisibility.is_active);

  // Pet Parents see the cautionary notice (strike three) as soon as they
  // open a flagged Nomad's profile — once per visit.
  useEffect(() => {
    if (isPetParentViewer && nomadWarning.hasWarning) setWarningOpen(true);
  }, [isPetParentViewer, nomadWarning.hasWarning]);

  const startConversation = useStartConversation();
  const { data: ratingData } = useSitterAverageRating(user ? userId : undefined);

  useEffect(() => {
    const fetchSitterData = async () => {
      if (!userId || !user) {
        setLoading(false);
        return;
      }
      try {
        const [sitterResult, profileResult] = await Promise.all([
          supabase.from("sitter_profiles").select(SITTER_PROFILE_COLUMNS as "*").eq("user_id", userId).maybeSingle(),
          publicProfiles("first_name, avatar_url, city, country, founding_member, email_verified, phone_verified").eq("id", userId).maybeSingle(),
        ]);
        if (sitterResult.error) throw sitterResult.error;
        if (profileResult.error) throw profileResult.error;
        setSitter(sitterResult.data as unknown as SitterProfile | null);
        setProfile(profileResult.data as unknown as Profile | null);

        // Your published listings with open dates, for the invite.
        const today = new Date().toISOString().slice(0, 10);
        const { data: listingsData } = await supabase
          .from("listings")
          .select("id, title, city, country, sit_dates (id, start_date, end_date, status)")
          .eq("owner_user_id", user.id)
          .eq("status", "published");
        setListings(
          ((listingsData ?? []) as InviteListing[]).filter((l) => l.sit_dates?.some((d) => d.status === "open" && d.end_date >= today)),
        );
      } catch (error) {
        console.error("Error fetching sitter:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to load this profile" });
      } finally {
        setLoading(false);
      }
    };
    fetchSitterData();
  }, [userId, user]);

  const showBar = !!user && !!sitter && !!profile && (isOther || preview);
  useHideBottomNav(showBar);

  const name = profile?.first_name || "Nomad";
  const location = profile ? [profile.city, profile.country].filter(Boolean).join(", ") : null;
  const allPhotos = [profile?.avatar_url, ...(sitter?.gallery || [])].filter(Boolean) as string[];

  // AuthContext.loading starts true and user starts null until the session
  // check resolves — check it first so a genuinely signed-in member doesn't
  // briefly see the "sign in" wall while their session is still loading in.
  if (authLoading) return <Skeletons />;

  if (!user) {
    return (
      <RoleTheme role="owner" className="flex min-h-screen flex-col">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex flex-1 flex-col items-center pb-12 pt-24")}>
          <div className="flex max-w-md flex-col items-center gap-3 rounded-[22px] border border-dashed border-border p-8 text-center">
            <h1 className="text-[20px] font-bold">Sign in to view this profile</h1>
            <p className="text-[15px] text-muted-foreground">Nomad profiles are only visible to members, to protect their privacy.</p>
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

  if (preview && (!profile || hiddenFromMembers)) {
    return (
      <RoleTheme role="sitter" className="flex min-h-screen flex-col">
        <Navbar wide />
        <main className="flex-1 pt-16">
          <PreviewBar showTips={showTips} onToggleTips={() => setShowTips((v) => !v)} accent="coral" />
          <div className="mx-auto max-w-xl px-5 py-6">
            <HiddenProfileNotice
              text="Other members can't find or open your Nomad profile right now. Turn your visibility back on to be seen and invited."
              action={{ label: "Change visibility", to: "/find-nomads" }}
            />
          </div>
        </main>
      </RoleTheme>
    );
  }

  if (!sitter || !profile) {
    return (
      <RoleTheme role="owner" className="flex min-h-screen flex-col">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex flex-1 flex-col items-center pb-12 pt-24")}>
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <h1 className="font-display text-[28px]">Nomad not found</h1>
            <p className="text-[15px] text-muted-foreground">This profile doesn't exist or may have been removed.</p>
            <Link to="/browse-sitters" className={nnButton("primary")}>
              Browse Nomads
            </Link>
          </div>
        </main>
        <Footer />
      </RoleTheme>
    );
  }

  const profileUrl = `https://nomadnest.global/sitter/${userId}`;
  const profileTitleMeta = `${name}${location ? ` in ${location}` : ""} | Nomad on NomadNest`.slice(0, 60);
  const profileDescriptionMeta = `Meet ${name}, a Nomad on NomadNest${location ? ` based in ${location}` : ""}. See their experience, reviews and availability for pet and house sits.`.slice(0, 155);

  const pets = dedupePetTypes(sitter.pet_types || []);
  const shownPets = pets.slice(0, MAX_PETS);
  const extraPets = pets.slice(MAX_PETS);
  const places = [...(sitter.preferred_regions ?? []), ...(sitter.preferred_countries ?? []), ...(sitter.preferred_cities ?? [])];
  const hasStyle = !!sitter.sit_style || sitter.comfortable_with?.length > 0 || sitter.home_preferences?.length > 0 || places.length > 0;
  const canInvite = listings.length > 0;

  const messageNomad = async () => {
    setIsStartingChat(true);
    try {
      const { conversationId } = await startConversation.mutateAsync({ otherUserId: userId!, conversationType: "direct" });
      navigate(`/inbox?conversation=${conversationId}`);
    } catch (error) {
      toast({ variant: "destructive", title: "Couldn't open the chat", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsStartingChat(false);
    }
  };

  const stat = (value: React.ReactNode, label: string) => (
    <div className="flex flex-col items-center gap-0.5 px-2 text-center">
      <span className="text-[17px] font-bold">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );

  const badge = (Icon: typeof BadgeCheck, label: string) => (
    <span className="inline-flex h-[26px] items-center gap-1 rounded-full bg-[var(--nn-ok-bg)] px-2.5 text-xs font-bold text-brand-teal-text">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );

  const actions = (where: "bar" | "side") => (
    <div className={cn("flex gap-2", where === "side" && "flex-col")}>
      {isOther && (
        <button type="button" onClick={messageNomad} disabled={isStartingChat} className={nnButton(isPetParentViewer ? "secondary" : "primary", "h-[52px] flex-1 rounded-2xl text-[15px]")}>
          {isStartingChat ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
          Message
        </button>
      )}
      {(isPetParentViewer || preview) && (
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          disabled={preview || !canInvite}
          className={nnButton("primary", "h-[52px] flex-1 rounded-2xl text-[15px] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100")}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Invite to a sit
        </button>
      )}
    </div>
  );
  const actionsNote = preview ? (
    <p className="text-sm text-muted-foreground">Pet Parents see Invite here. It's switched off in preview.</p>
  ) : isPetParentViewer && !canInvite ? (
    <p className="text-sm text-muted-foreground">
      Publish a listing with open dates to invite {name}.{" "}
      <Link to="/create-listing" className="font-bold text-[var(--nn-accent-dark)] underline underline-offset-2">
        Create a listing
      </Link>
    </p>
  ) : null;

  const summary = (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4 md:flex-col md:items-center md:text-center">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-[#D8C3B0] md:h-32 md:w-32">
          {allPhotos.length > 0 ? (
            <button type="button" onClick={() => setPhotoOpen(true)} aria-label={`Open ${name}'s photos`} className="h-full w-full">
              <img src={allPhotos[0]} alt="" className="h-full w-full object-cover" />
            </button>
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-[#5A4636]">{name.slice(0, 1)}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1 md:items-center">
          <h1 className="font-display text-[30px] font-normal leading-tight lg:text-[34px]">{name}</h1>
          {sitter.headline && <p className="text-[16px] font-semibold leading-snug">{sitter.headline}</p>}
          <p className="text-[15px] text-muted-foreground">Nomad{location ? ` · ${location}` : ""}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 md:justify-center">
        {profile.founding_member && <StatusChip tone="gold">★ Founding Member</StatusChip>}
        {sitter.id_verified && badge(BadgeCheck, "ID verified")}
        {profile.email_verified && badge(Mail, "Email")}
        {profile.phone_verified && badge(Phone, "Phone")}
        {sitter.background_check && badge(ShieldCheck, "Background check")}
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--nn-line)] rounded-[20px] border border-[var(--nn-border)] bg-card py-3">
        {ratingData && ratingData.count > 0
          ? stat(
              <span className="inline-flex items-center gap-1">
                <Star className="h-4 w-4 fill-[#E8B53E] text-[#E8B53E]" aria-hidden="true" />
                {ratingData.average.toFixed(1)}
              </span>,
              `${ratingData.count} ${ratingData.count === 1 ? "review" : "reviews"}`,
            )
          : stat("New", "No reviews yet")}
        {stat(portfolio.length, portfolio.length === 1 ? "Sit Story" : "Sit Stories")}
        {stat(reviewRate?.review_rate !== null && reviewRate?.review_rate !== undefined ? `${reviewRate.review_rate}%` : "—", "Review rate")}
      </div>
      {freeDates && freeDates.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[20px] bg-[var(--nn-ok-bg)] p-4">
          <p className="text-[15px] font-bold">Free to sit</p>
          <ul className="flex flex-wrap gap-2">
            {freeDates.map((r) => (
              <li key={r.start} className="rounded-full bg-card px-3 py-1 text-sm font-semibold text-brand-teal-text">
                {shortRange(r.start, r.end)} · {r.days} {r.days === 1 ? "day" : "days"}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Only free dates show. Where {preview ? "you're" : `${name} is`} sitting now is never shown.</p>
        </div>
      )}
      {preview && showTips && freeDates && freeDates.length === 0 && (
        <PreviewTip title="No free dates yet" text="Pet Parents plan ahead. Add the dates you're free and you'll show up for their sits." action={{ label: "Set your dates", to: "/availability" }} />
      )}
      <div className="hidden flex-col gap-2 md:flex">
        {actions("side")}
        {actionsNote}
      </div>
    </div>
  );

  return (
    <RoleTheme role="owner" className="flex min-h-screen flex-col">
      <Helmet>
        <title>{profileTitleMeta}</title>
        <meta name="description" content={profileDescriptionMeta} />
        <link rel="canonical" href={profileUrl} />
        <meta property="og:title" content={profileTitleMeta} />
        <meta property="og:description" content={profileDescriptionMeta} />
        <meta property="og:url" content={profileUrl} />
        <meta name="twitter:title" content={profileTitleMeta} />
        <meta name="twitter:description" content={profileDescriptionMeta} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            url: profileUrl,
            mainEntity: { "@type": "Person", name, address: location || undefined },
          })}
        </script>
      </Helmet>
      <Navbar wide />
      <main className={cn("flex-1 pt-16", showBar ? "pb-32 md:pb-16" : "pb-16")}>
        {preview && <PreviewBar showTips={showTips} onToggleTips={() => setShowTips((v) => !v)} accent="coral" />}
        <div className={cn(NN_PAGE, "flex flex-col gap-5 pt-4 md:pt-8")}>
          <div className="flex items-center justify-between gap-2">
            {!preview ? <BackButton fallback={user.id === userId ? "/dashboard" : "/browse-sitters"} label="Browse Nomads" className="h-11" /> : <span />}
            <ShareDialog title={`${name} - Pet Sitter`} description={sitter.headline || `Check out ${name}'s pet sitting profile`} />
          </div>

          <div className="flex flex-col gap-6 md:grid md:grid-cols-[280px_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
            <SectionCard className="p-0 md:sticky md:top-24 md:p-5 max-md:border-0 max-md:bg-transparent">{summary}</SectionCard>

            <div className="flex min-w-0 flex-col gap-7">
              {preview && showTips && !sitter.bio && (
                <PreviewTip title="About me is empty" text="Pet Parents skip this section right now. A few lines about the pets you've cared for makes you far more likely to be invited." action={{ label: "Add a bio", to: "/edit-sitter-profile" }} />
              )}
              {preview && showTips && (sitter.gallery ?? []).length < 2 && (
                <PreviewTip title="Add a couple of photos" text="Photos of you with pets help Pet Parents picture you in their home." action={{ label: "Add photos", to: "/edit-sitter-profile" }} />
              )}
              {preview && showTips && portfolio.length === 0 && (
                <PreviewTip title="Sit Stories show here" text="After a sit, ask the Pet Parent to approve your story. Approved stories appear here for future hosts." action={{ label: "Your Sit Stories", to: "/my-sit-stories" }} />
              )}

              {(sitter.bio || sitter.why_i_sit || sitter.experience_details) && (
                <Section title={`About ${name}`}>
                  {sitter.bio && <p className="whitespace-pre-line text-[16px] leading-relaxed">{sitter.bio}</p>}
                  {(sitter.why_i_sit || sitter.experience_details) && (
                    <>
                      {moreOpen && (
                        <div id="nomad-more" className="flex flex-col gap-4">
                          {sitter.why_i_sit && (
                            <div className="flex flex-col gap-1">
                              <h3 className="text-[15px] font-bold">Why I pet sit</h3>
                              <p className="whitespace-pre-line text-[16px] leading-relaxed">{sitter.why_i_sit}</p>
                            </div>
                          )}
                          {sitter.experience_details && (
                            <div className="flex flex-col gap-1">
                              <h3 className="text-[15px] font-bold">Experience</h3>
                              <p className="whitespace-pre-line text-[16px] leading-relaxed">{sitter.experience_details}</p>
                            </div>
                          )}
                        </div>
                      )}
                      <button type="button" aria-expanded={moreOpen} aria-controls="nomad-more" onClick={() => setMoreOpen(!moreOpen)} className="min-h-11 self-start text-[15px] font-bold underline underline-offset-2">
                        {moreOpen ? "Show less" : `Why ${name} sits and their experience`}
                      </button>
                    </>
                  )}
                </Section>
              )}

              {(sitter.gallery ?? []).length > 0 && (
                <Section title="Photos">
                  <div className="grid grid-cols-3 gap-2">
                    {(sitter.gallery ?? []).slice(0, 6).map((p, i) => (
                      <button
                        key={p + i}
                        type="button"
                        onClick={() => {
                          setSelectedPhoto(allPhotos.indexOf(p));
                          setPhotoOpen(true);
                        }}
                        aria-label={`Open photo ${i + 1}`}
                        className="aspect-square overflow-hidden rounded-2xl bg-muted"
                      >
                        <img src={p} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Pets and skills">
                <div className="flex flex-wrap gap-2">
                  {shownPets.map((p) => (
                    <StatusChip key={p} tone="grey">
                      {formatPetType(p)}
                    </StatusChip>
                  ))}
                  {extraPets.length > 0 && (
                    <span title={extraPets.map(formatPetType).join(", ")}>
                      <StatusChip tone="grey">+{extraPets.length}</StatusChip>
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-3 text-[15px]">
                  {sitter.experience_level && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Experience</dt>
                      <dd className="font-semibold">{cap(sitter.experience_level)}</dd>
                    </div>
                  )}
                  {sitter.languages?.length > 0 && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Languages</dt>
                      <dd className="font-semibold">{sitter.languages.join(", ")}</dd>
                    </div>
                  )}
                </dl>
                {hasStyle && (
                  <button type="button" onClick={() => setStyleOpen(true)} className="flex min-h-[56px] items-center gap-3 rounded-[18px] border border-[var(--nn-border)] bg-card px-4 text-left">
                    <span className="flex-1 text-[16px] font-bold">How {name} likes to sit</span>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </button>
                )}
              </Section>

              {userId && <SitterPortfolio sitterId={userId} />}

              <Section title="Reviews">
                <SitterReviewsSummaryCard sitterUserId={userId!} />
              </Section>

              {location && (
                <Section title="Based in">
                  <p className="text-[15px]">
                    {location}. <span className="text-muted-foreground">City only, never an address.</span>
                  </p>
                </Section>
              )}

              {isOther && (
                <ReportDialog
                  targetType="user"
                  targetId={userId!}
                  targetLabel="sitter"
                  trigger={
                    <button type="button" className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-semibold text-muted-foreground underline underline-offset-2">
                      <Flag className="h-4 w-4" aria-hidden="true" />
                      Report this profile
                    </button>
                  }
                />
              )}

              {preview && <NeverShownNote>your last name, email, phone number, date of birth, ID documents or exact location.</NeverShownNote>}
            </div>
          </div>
        </div>
      </main>

      {/* Phone: Message and Invite stay at the bottom. */}
      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-1.5 border-t border-border bg-card px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden">
          {actions("bar")}
          {actionsNote}
        </div>
      )}

      <PhotoLightbox open={photoOpen} onOpenChange={setPhotoOpen} photos={allPhotos} startIndex={Math.max(0, selectedPhoto)} alt={name} onIndexChange={setSelectedPhoto} />

      <ResponsiveSheet open={styleOpen} onOpenChange={setStyleOpen} title={`How ${name} likes to sit`} description={`${name}'s sitting style and preferences`}>
        <div className="flex flex-col gap-5 text-[16px]">
          {(sitter.sit_style || sitter.comfortable_with?.length > 0) && (
            <div className="flex flex-col gap-1">
              <h3 className="text-[15px] font-bold">Sitting style</h3>
              <p className="text-muted-foreground">
                {[sitter.sit_style, sitter.comfortable_with?.length ? `Comfortable with ${sitter.comfortable_with.join(", ").toLowerCase()}.` : null].filter(Boolean).join(". ")}
              </p>
            </div>
          )}
          {sitter.home_preferences?.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-[15px] font-bold">Home preferences</h3>
              <p className="text-muted-foreground">{sitter.home_preferences.join(" · ")}</p>
            </div>
          )}
          {places.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-[15px] font-bold">Favourite places</h3>
              <p className="text-muted-foreground">{places.join(" · ")}</p>
            </div>
          )}
        </div>
      </ResponsiveSheet>

      {isPetParentViewer && canInvite && (
        <InvitePanel
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          sitterUserId={userId!}
          sitterName={name}
          ownerUserId={user.id}
          listings={listings}
          freeDates={freeDates ?? []}
        />
      )}

      <CommunityWarningModal
        open={warningOpen}
        onOpenChange={setWarningOpen}
        labels={nomadWarning.labels}
        audience="nomad"
        continueLabel="Continue to Nomad Profile"
        onContinue={() => setWarningOpen(false)}
      />

      <div className={cn(showBar && "hidden md:block")}>
        <Footer />
      </div>
    </RoleTheme>
  );
};

export default SitterDetail;
