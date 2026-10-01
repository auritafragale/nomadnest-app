import { Helmet } from "react-helmet-async";
import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Flag, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareDialog } from "@/components/share/ShareDialog";
import { supabase } from "@/integrations/supabase/client";
import { publicProfiles } from "@/lib/publicProfile";
import { fetchPublicMemberCards } from "@/lib/publicMemberCards";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { BackButton } from "@/components/layout/BackButton";
import { ApplyDialog } from "@/components/applications/ApplyDialog";
import { PET_PUBLIC_COLUMNS, tryFetchOwnPetPrivateDetails } from "@/lib/privateColumns";
import CommunityWarningModal from "@/components/trust/CommunityWarningModal";
import { useCommunityWarning } from "@/hooks/useCommunityWarning";
import { differenceInDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useStartConversation } from "@/hooks/useConversations";
import ReportDialog from "@/components/reports/ReportDialog";
import ListingLocationMap from "@/components/maps/ListingLocationMap";
import InlineWelcomeGuide from "@/components/listing/InlineWelcomeGuide";
import { useAcceptedSitter } from "@/hooks/useAcceptedSitter";
import SignUpPromptDialog from "@/components/auth/SignUpPromptDialog";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { PhotoLightbox } from "@/components/profile/PhotoLightbox";
import { useUpdateInviteStatus } from "@/hooks/useSitterInvites";
import { useApplicationSubmission } from "@/hooks/useApplicationSubmission";
import { useHideBottomNav } from "@/lib/bottomNav";
import { NN_PAGE, RoleTheme, StatusChip, nnButton, shortRange } from "@/components/nn/ui";
import {
  AboutText,
  DateTiles,
  HeartButton,
  HomePanel,
  HomeRows,
  HostCard,
  PetCards,
  PetPanel,
  PhoneGallery,
  PhotoMosaic,
  QuickFacts,
  SectionTitle,
  communicationLine,
  type ListingHomeFields,
  type ListingPet,
  type ListingSitDate,
} from "@/components/listing/ListingParts";

interface Profile {
  first_name: string | null;
  avatar_url: string | null;
  founding_member: boolean | null;
  id_verified?: boolean | null;
}

interface Listing extends ListingHomeFields {
  id: string;
  title: string;
  description: string | null;
  ideal_nomad_types: string[];
  city: string;
  country: string;
  area: string | null;
  photos: string[];
  ideal_sitter_description: string | null;
  communication_style: string | null;
  owner_user_id: string;
  latitude: number | null;
  longitude: number | null;
  /**
   * Fetched separately via the get_listing_private_address RPC, never via a
   * raw table select — RLS on `listings` is row-level only, so a plain
   * select("address_private") would hand it to every visitor a listing is
   * visible to, not just the owner/accepted Nomad the RPC restricts it to.
   */
  address_private: string | null;
  pets: ListingPet[];
  sit_dates: ListingSitDate[];
  profiles: Profile | null;
}

type Viewer = "out" | "owner" | "confirmed" | "parent" | "nomad";

/** Listing page (design: ListingPhone, ListingTablet, ListingDesktop). */
const ListingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, role } = useAuth();
  const { toast } = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedDateIds, setSelectedDateIds] = useState<string[]>([]);
  const [warningOpen, setWarningOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState<"save" | "profile" | null>(null);
  const [petPanelId, setPetPanelId] = useState<string | null>(null);
  const [homeTab, setHomeTab] = useState<"home" | "rules" | null>(null);
  const [messaging, setMessaging] = useState(false);
  const listingWarning = useCommunityWarning("listing", id);
  const updateInviteStatus = useUpdateInviteStatus();
  const startConversation = useStartConversation();
  const {
    hasAccess,
    membershipLoading,
    verificationData,
    verificationLoading,
    checkApplicability,
    submitApplications,
  } = useApplicationSubmission();
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  // A Nomad arriving via "View" on an invitation carries the invite id in
  // the URL. Only honor it once it's confirmed to belong to this listing
  // and this Nomad, and is still actionable — an already-declined/applied
  // or stale invite (e.g. a copied/bookmarked link) is silently ignored.
  const inviteIdParam = searchParams.get("invite");
  const [invite, setInvite] = useState<{ id: string; status: string } | null>(null);
  useEffect(() => {
    if (!inviteIdParam || !listing?.id || !user) {
      setInvite(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("sitter_invites")
      .select("id, listing_id, sitter_user_id, status")
      .eq("id", inviteIdParam)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (
          data &&
          data.listing_id === listing.id &&
          data.sitter_user_id === user.id &&
          (data.status === "pending" || data.status === "viewed")
        ) {
          setInvite({ id: data.id, status: data.status });
        } else {
          setInvite(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inviteIdParam, listing?.id, user]);

  const handleDeclineInvite = () => {
    if (!invite) return;
    updateInviteStatus.mutate(
      { inviteId: invite.id, status: "declined" },
      {
        onSuccess: () => {
          setInvite(null);
          toast({ title: "Invite declined" });
        },
        onError: () => {
          toast({
            title: "Could not decline invite",
            description: "Please check your connection and try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const { data: favoriteIds = [] } = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const isFavorited = listing ? favoriteIds.includes(listing.id) : false;

  useEffect(() => {
    const fetchListing = async () => {
      if (!id) return;

      try {
        // Fetch listing separately due to no FK relationship with profiles
        const { data: listingData, error: listingError } = await supabase
          .from("listings")
          .select(
            "id, owner_user_id, title, description, ideal_nomad_types, city, country, area, " +
            "home_type, location_type, public_transport_accessible, sleeping_arrangement, amenities, wifi_quality, " +
            "house_rules, house_rules_other, home_care_tasks, home_care_tasks_other, " +
            "requirements, requirements_other, communication_style, " +
            "ideal_sitter_description, photos, status, latitude:approx_latitude, longitude:approx_longitude, " +
            "remote_location, car_needed, heavy_gardening, wheelchair_accessible, " +
            "created_at, updated_at"
          )
          .eq("id", id)
          .maybeSingle();

        if (listingError || !listingData) {
          toast({
            title: "Listing not found",
            description: "This listing doesn't exist or has been removed",
            variant: "destructive",
          });
          navigate("/browse-sits");
          return;
        }

        const listingRow = listingData as unknown as Omit<Listing, "pets" | "sit_dates" | "profiles" | "address_private">;

        const [petsResult, datesResult, profileResult] = await Promise.all([
          // Public columns only: vet info and medication instructions are
          // private, and loaded below for the owner via their RPC.
          supabase.from("pets").select(PET_PUBLIC_COLUMNS).eq("listing_id", id),
          supabase.from("sit_dates").select("*").eq("listing_id", id),
          // Signed-out visitors get the host's first name and photo only.
          user
            ? publicProfiles("first_name, avatar_url, founding_member, id_verified")
                .eq("id", listingRow.owner_user_id)
                .maybeSingle()
            : fetchPublicMemberCards([listingRow.owner_user_id]).then((cards) => ({ data: cards[0] ?? null })),
        ]);

        setListing({
          ...listingRow,
          address_private: null,
          pets: (petsResult.data || []) as unknown as ListingPet[],
          sit_dates: (datesResult.data || []) as ListingSitDate[],
          profiles: (profileResult.data as unknown as Profile | null) || null,
        });
      } catch (error) {
        console.error("Error fetching listing:", error);
        toast({
          title: "Error loading listing",
          description: "This listing could not be found",
          variant: "destructive",
        });
        navigate("/browse-sits");
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [id, navigate, toast, user]);

  const allPhotos = listing ? [...listing.photos, ...listing.pets.flatMap((pet) => pet.photos || [])] : [];

  const today = new Date().toISOString().slice(0, 10);
  const openDates = (listing?.sit_dates.filter((d) => d.status === "open" && d.end_date >= today) || []).sort((a, b) =>
    a.start_date.localeCompare(b.start_date),
  );
  const selectedSitDates = openDates.filter((d) => selectedDateIds.includes(d.id));
  const toggleDate = (dateId: string) =>
    setSelectedDateIds((prev) => (prev.includes(dateId) ? prev.filter((d) => d !== dateId) : [...prev, dateId]));

  // The Pet Parent already reviewed and chose this Nomad by sending the
  // invite, so accepting it skips ApplyDialog's form entirely and submits
  // straight away — but it still has to pass every gate the normal form
  // flow enforces (membership, verification, already-applied/full-round),
  // just with the equivalent blocking messaging/redirect instead of a
  // silent bypass.
  const handleAcceptInvitation = async () => {
    if (!invite || !listing || selectedSitDates.length === 0) return;

    if (!membershipLoading && !hasAccess("sitter")) {
      toast({
        title: "Nomad Membership Required",
        description: "You need an active Nomad or Combined membership to apply for sits.",
        variant: "destructive",
      });
      navigate("/membership");
      return;
    }
    if (!verificationLoading && !verificationData?.id_verified) {
      toast({
        title: "Identity Verification Required",
        description: "You need to verify your identity before applying for sits. It only takes 5 minutes.",
        variant: "destructive",
      });
      navigate("/verify-identity");
      return;
    }

    setAcceptingInvite(true);
    try {
      const check = await checkApplicability(listing.id, selectedSitDates);
      if (check.hasExistingApplication) {
        toast({
          title: "Not available",
          description:
            check.alreadyApplied.size > 0
              ? "You've already applied for these dates."
              : "Applications are paused for these dates. Check back soon.",
          variant: "destructive",
        });
        return;
      }

      await submitApplications({
        listingId: listing.id,
        listingTitle: listing.title,
        dates: check.applicableDates,
        message: "I'm happy to accept this invitation!",
      });

      toast({
        title: check.applicableDates.length > 1 ? `${check.applicableDates.length} applications sent!` : "Application sent!",
        description: "The Pet Parent will review your application soon.",
      });

      updateInviteStatus.mutate({ inviteId: invite.id, status: "applied" });
      setSelectedDateIds([]);
    } catch (error) {
      console.error("Error accepting invitation:", error);
      toast({
        title: "Failed to apply",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setAcceptingInvite(false);
    }
  };

  const isOwner = !!user && user.id === listing?.owner_user_id;
  const { data: acceptedSitter = false } = useAcceptedSitter(listing?.id);

  // The Nomad's own confirmed or current sit here, for "Your dates".
  const { data: mySit = null } = useQuery({
    queryKey: ["listing-my-sit", listing?.id, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sits")
        .select("id, sit_dates_id, snapshot_start_date, snapshot_end_date")
        .eq("listing_id", listing!.id)
        .eq("sitter_user_id", user!.id)
        .in("status", ["confirmed", "in_progress"])
        .limit(1);
      return data?.[0] ?? null;
    },
    enabled: !!listing?.id && !!user && !isOwner && acceptedSitter,
  });

  // The owner's applicants waiting for an answer, per date range.
  const { data: applicantCounts = {} } = useQuery({
    queryKey: ["listing-applicant-counts", listing?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("applications")
        .select("sit_dates_id")
        .eq("listing_id", listing!.id)
        .in("status", ["applied", "shortlisted"]);
      const counts: Record<string, number> = {};
      for (const a of data ?? []) counts[a.sit_dates_id] = (counts[a.sit_dates_id] ?? 0) + 1;
      return counts;
    },
    enabled: !!listing?.id && isOwner,
  });

  // The exact address is only ever shown in the Welcome Guide to the owner
  // or an accepted Nomad — fetched via the access-checked RPC rather than
  // added to the listing select, which would leak it to every visitor.
  useEffect(() => {
    if (!listing?.id || !(isOwner || acceptedSitter)) return;
    supabase.rpc("get_listing_private_address", { p_listing_id: listing.id }).then(({ data }) => {
      setListing((prev) => (prev ? { ...prev, address_private: data ?? null } : prev));
    });
  }, [listing?.id, isOwner, acceptedSitter]);

  // The owner also sees their pets' vet info and medication instructions,
  // which aren't in the public pet columns.
  useEffect(() => {
    if (!listing?.id || !isOwner) return;
    tryFetchOwnPetPrivateDetails(listing.id).then((details) => {
      if (details.size === 0) return;
      setListing((prev) =>
        prev
          ? {
              ...prev,
              pets: prev.pets.map((pet) => ({
                ...pet,
                vet_info: details.get(pet.id)?.vet_info ?? null,
                medication_instructions: details.get(pet.id)?.medication_instructions ?? null,
              })),
            }
          : prev,
      );
    });
  }, [listing?.id, isOwner]);

  // The page's own bar replaces the bottom nav on phones.
  useHideBottomNav(!!listing);

  if (loading) {
    return (
      <RoleTheme role="sitter" className="min-h-screen">
        <Navbar wide />
        <main className={cn(NN_PAGE, "flex flex-col gap-4 pb-12 pt-20 md:pt-24")}>
          <Skeleton className="-mx-5 h-[290px] md:mx-0 md:h-[340px] md:rounded-[24px]" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-48 w-full rounded-[22px]" />
        </main>
      </RoleTheme>
    );
  }

  if (!listing) return null;

  const hostFirst = listing.profiles?.first_name || null;
  const hostName = hostFirst || "the Pet Parent";
  const place = [listing.area, listing.city, listing.country].filter(Boolean).join(", ");
  const isNomadAccount = role === "sitter" || role === "both";
  const viewer: Viewer = !user ? "out" : isOwner ? "owner" : mySit ? "confirmed" : !isNomadAccount ? "parent" : "nomad";
  const shortNotice = openDates.length > 0 && differenceInDays(parseISO(openDates[0].start_date), new Date()) <= 14;
  const totalApplicants = Object.values(applicantCounts).reduce((a, b) => a + b, 0);

  // Confirmed Nomads see only their own dates; everyone else the open ones.
  const confirmedDate = mySit ? listing.sit_dates.find((d) => d.id === mySit.sit_dates_id) : undefined;
  const shownDates: ListingSitDate[] =
    viewer === "confirmed"
      ? confirmedDate
        ? [confirmedDate]
        : mySit?.snapshot_start_date && mySit.snapshot_end_date
          ? [{ id: mySit.id, start_date: mySit.snapshot_start_date, end_date: mySit.snapshot_end_date, flexibility: null, handover_preference: null, status: "filled" }]
          : []
      : openDates;
  const dateBadges =
    viewer === "owner"
      ? Object.fromEntries(
          openDates.map((d) => {
            const n = applicantCounts[d.id] ?? 0;
            return [d.id, { text: n === 0 ? "No applicants yet" : `${n} ${n === 1 ? "applicant" : "applicants"}`, tone: "green" as const }];
          }),
        )
      : viewer === "confirmed"
        ? Object.fromEntries(shownDates.map((d) => [d.id, { text: "Confirmed", tone: "accent" as const }]))
        : undefined;
  const sitRange = shownDates[0] && viewer === "confirmed" ? shortRange(shownDates[0].start_date, shownDates[0].end_date) : null;

  const listingUrl = `https://nomadnest.global/listing/${listing.id}`;
  const listingTitleMeta = `${listing.title} | Pet Sit in ${listing.city || listing.country || "the world"}`.slice(0, 60);
  const listingDescriptionMeta = (
    listing.description || `A house and pet sit in ${[listing.city, listing.country].filter(Boolean).join(", ")} on NomadNest.`
  )
    .replace(/\s+/g, " ")
    .slice(0, 155);
  const shareText = `Check out this pet sitting opportunity in ${listing.city}, ${listing.country}`;

  const heart =
    viewer === "owner"
      ? undefined
      : {
          saved: isFavorited,
          onToggle: () => (user ? toggleFavorite.mutate({ listingId: listing.id, isFavorited }) : setPromptOpen("save")),
        };

  const scrollToDates = () => {
    const el = [document.getElementById("available-dates"), document.getElementById("available-dates-side")].find(
      (e) => e && e.offsetParent !== null,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startApply = () => {
    if (selectedDateIds.length === 0) {
      scrollToDates();
      return;
    }
    if (listingWarning.hasWarning) setWarningOpen(true);
    else if (invite) handleAcceptInvitation();
    else setApplyDialogOpen(true);
  };

  const messageHost = async () => {
    setMessaging(true);
    try {
      const { conversationId } = await startConversation.mutateAsync({
        otherUserId: listing.owner_user_id,
        listingId: listing.id,
        conversationType: "listing",
      });
      navigate(`/inbox?conversation=${conversationId}`);
    } catch {
      toast({ title: "Couldn't open the chat", description: "Please try again.", variant: "destructive" });
    } finally {
      setMessaging(false);
    }
  };

  const nSel = selectedDateIds.length;

  /** The viewer's actions: the phone's fixed bar and the sidebar card share them. */
  const actions = (where: "bar" | "side") => {
    const btn = (variant: "primary" | "secondary", extra?: string) =>
      nnButton(variant, cn("h-[52px] whitespace-nowrap rounded-2xl px-5 text-[15px]", where === "side" ? "w-full" : "shrink-0", extra));
    const text = (title: string, sub?: string) => (
      <div className={cn("flex min-w-0 flex-col", where === "side" && "items-center text-center")}>
        <span className="text-[15px] font-bold leading-snug">{title}</span>
        {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
      </div>
    );
    const wrap = (children: React.ReactNode) => (
      <div className={cn(where === "bar" ? "flex items-center justify-between gap-3" : "flex flex-col gap-2.5")}>{children}</div>
    );
    switch (viewer) {
      case "out":
        return wrap(
          <>
            {where === "bar" && text("Free to browse", "Membership from £59 a year")}
            <Link to="/auth" className={btn("primary")}>
              Sign in to apply
            </Link>
            {where === "side" && <p className="text-center text-sm text-muted-foreground">Free to browse · Membership from £59 a year</p>}
          </>,
        );
      case "owner":
        return wrap(
          <div className={cn("flex gap-2", where === "bar" ? "w-full" : "flex-col")}>
            <Link to={`/edit-listing/${listing.id}`} className={btn("secondary", "flex-1")}>
              Edit listing
            </Link>
            <Link to="/applications" className={btn("primary", "flex-1")}>
              Applicants
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-card px-1.5 text-xs font-bold text-foreground">
                {totalApplicants}
              </span>
            </Link>
          </div>,
        );
      case "confirmed":
        return wrap(
          <div className={cn("flex gap-2", where === "bar" ? "w-full" : "flex-col")}>
            <button type="button" onClick={messageHost} disabled={messaging} className={btn("primary", "flex-1")}>
              {messaging && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Message {hostFirst ?? "your host"}
            </button>
            <Link to="/my-sits" className={btn("secondary", "flex-1")}>
              My sits
            </Link>
          </div>,
        );
      case "parent":
        return wrap(
          <>
            {text("Only Nomad accounts can apply.", "Add a Nomad membership to sit too.")}
            <Link to="/membership" className={btn("secondary", "shrink-0")}>
              Membership
            </Link>
          </>,
        );
      default:
        if (openDates.length === 0) return wrap(text("No open dates right now", "Save it and check back soon."));
        return (
          <div className="flex flex-col gap-2">
            {wrap(
              <>
                {where === "bar" &&
                  text(nSel > 0 ? `${nSel} date ${nSel === 1 ? "range" : "ranges"} picked` : "Pick your dates", nSel > 0 ? "No booking fees" : `${openDates.length} date ${openDates.length === 1 ? "range" : "ranges"} open`)}
                <button
                  type="button"
                  onClick={startApply}
                  disabled={acceptingInvite}
                  className={btn(nSel > 0 ? "primary" : "secondary", "shrink-0")}
                >
                  {acceptingInvite && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {nSel === 0 ? (where === "side" ? "Pick dates above" : "Choose dates") : invite ? "Accept invitation" : nSel > 1 ? `Apply for ${nSel}` : "Apply"}
                </button>
                {where === "side" && <p className="text-center text-sm text-muted-foreground">No booking fees, ever.</p>}
              </>,
            )}
            {invite && (
              <button
                type="button"
                onClick={handleDeclineInvite}
                disabled={updateInviteStatus.isPending || acceptingInvite}
                className={nnButton("ghost", "self-center")}
              >
                Decline invitation
              </button>
            )}
          </div>
        );
    }
  };

  const datesTitle = viewer === "confirmed" ? "Your dates" : viewer === "owner" ? "Open dates" : "Available dates";
  const datesBlock = (sectionId: string) => (
    <section id={sectionId} aria-labelledby={`${sectionId}-title`} className="flex scroll-mt-24 flex-col gap-3">
      <SectionTitle id={`${sectionId}-title`}>{datesTitle}</SectionTitle>
      {viewer === "nomad" && openDates.length > 0 && <p className="text-[15px] text-muted-foreground">Pick one or more. You can apply for them together.</p>}
      {shownDates.length > 0 ? (
        <DateTiles dates={shownDates} pickable={viewer === "nomad"} selected={selectedDateIds} onToggle={toggleDate} badges={dateBadges} />
      ) : (
        <p className="text-[15px] text-muted-foreground">No open dates right now.</p>
      )}
    </section>
  );

  const hostCard = viewer !== "owner" && (
    <HostCard
      ownerId={listing.owner_user_id}
      firstName={hostFirst}
      avatarUrl={listing.profiles?.avatar_url ?? null}
      founding={!!listing.profiles?.founding_member}
      idVerified={!!listing.profiles?.id_verified}
      communication={communicationLine(listing.communication_style)}
      signedIn={!!user}
      onSignUpPrompt={() => setPromptOpen("profile")}
    />
  );

  const titleBlock = (
    <div className="flex flex-col gap-2">
      {shortNotice && viewer !== "confirmed" && (
        <span className="self-start">
          <StatusChip tone="accent">Short notice</StatusChip>
        </span>
      )}
      <h1 className="font-display text-[30px] font-normal leading-tight lg:text-[38px]">{listing.title}</h1>
      <p className="text-[15px] text-muted-foreground">{place}</p>
      {listing.ideal_nomad_types.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-sm font-bold">Best for</span>
          {listing.ideal_nomad_types.map((t) => (
            <StatusChip key={t} tone="grey">
              {t}
            </StatusChip>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <RoleTheme role="sitter" className="flex min-h-screen flex-col">
      <Helmet>
        <title>{listingTitleMeta}</title>
        <meta name="description" content={listingDescriptionMeta} />
        <link rel="canonical" href={listingUrl} />
        <meta property="og:title" content={listingTitleMeta} />
        <meta property="og:description" content={listingDescriptionMeta} />
        <meta property="og:url" content={listingUrl} />
        <meta name="twitter:title" content={listingTitleMeta} />
        <meta name="twitter:description" content={listingDescriptionMeta} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            name: listing.title,
            description: listingDescriptionMeta,
            serviceType: "House and pet sitting exchange",
            url: listingUrl,
            areaServed: [listing.city, listing.country].filter(Boolean).join(", ") || undefined,
            provider: { "@type": "Organization", name: "NomadNest", url: "https://nomadnest.global" },
          })}
        </script>
      </Helmet>
      <Navbar wide />

      <main className={cn(NN_PAGE, "flex flex-1 flex-col gap-5 pb-32 pt-16 md:gap-6 md:pb-16 md:pt-24")}>
        <PhoneGallery
          photos={allPhotos}
          index={currentPhotoIndex}
          onIndex={setCurrentPhotoIndex}
          onOpen={() => setLightboxOpen(true)}
          shareTitle={listing.title}
          shareText={shareText}
          heart={heart}
        />

        {/* Tablet and desktop: Back, title with Share and Save, then the mosaic. */}
        <div className="hidden flex-col gap-4 md:flex">
          <BackButton fallback="/browse-sits" label="Browse Sits" className="h-11 self-start" />
          <div className="flex items-end justify-between gap-4">
            {titleBlock}
            <div className="flex shrink-0 gap-2">
              <ShareDialog title={listing.title} description={shareText} label="Share" />
              {heart && <HeartButton {...heart} label className="inline-flex h-11 items-center gap-2 rounded-full border border-input bg-background px-4 text-sm font-bold" />}
            </div>
          </div>
          <PhotoMosaic
            photos={allPhotos}
            onOpen={(i) => {
              setCurrentPhotoIndex(i);
              setLightboxOpen(true);
            }}
          />
        </div>

        <div className="md:hidden">{titleBlock}</div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
          <div className="flex min-w-0 flex-col gap-6">
            <QuickFacts dates={viewer === "confirmed" ? shownDates : openDates} pets={listing.pets} home={listing} />

            {(isOwner || acceptedSitter) && (
              <InlineWelcomeGuide listingId={listing.id} isOwner={isOwner} addressPrivate={listing.address_private} sitRange={sitRange} />
            )}

            <div className="md:hidden">{hostCard}</div>

            {listing.description && (
              <section aria-labelledby="about-title" className="flex flex-col gap-3">
                <SectionTitle id="about-title">About this sit</SectionTitle>
                <AboutText text={listing.description} />
              </section>
            )}

            {listing.pets.length > 0 && (
              <section aria-labelledby="pets-title" className="flex flex-col gap-3">
                <SectionTitle id="pets-title">Meet the pets</SectionTitle>
                <PetCards pets={listing.pets} onOpen={setPetPanelId} />
              </section>
            )}

            <section aria-labelledby="home-title" className="flex flex-col gap-3">
              <SectionTitle id="home-title">The home and what's expected</SectionTitle>
              <HomeRows home={listing} onOpen={setHomeTab} />
            </section>

            {listing.latitude && listing.longitude && (
              <section aria-labelledby="where-title" className="flex flex-col gap-3">
                <SectionTitle id="where-title">Where it is</SectionTitle>
                <p className="text-[15px]">{place}</p>
                <ListingLocationMap latitude={listing.latitude} longitude={listing.longitude} title={listing.title} />
              </section>
            )}

            <div className="md:hidden">{datesBlock("available-dates")}</div>

            {user && !isOwner && (
              <ReportDialog
                targetType="listing"
                targetId={listing.id}
                targetLabel={listing.title}
                trigger={
                  <button type="button" className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-semibold text-muted-foreground underline underline-offset-2">
                    <Flag className="h-4 w-4" aria-hidden="true" />
                    Report this listing
                  </button>
                }
              />
            )}
          </div>

          {/* Sidebar from tablet: the dates card with the viewer's actions, then the host. */}
          <aside className="hidden flex-col gap-4 md:flex">
            <div className="sticky top-24 flex flex-col gap-4">
              <div className="flex flex-col gap-4 rounded-[24px] border border-[var(--nn-border)] bg-card p-5 shadow-sm">
                {datesBlock("available-dates-side")}
                {actions("side")}
              </div>
              {hostCard}
            </div>
          </aside>
        </div>
      </main>

      {/* Phone: the fixed bar changes with who is looking. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden">
        {actions("bar")}
      </div>

      <PetPanel pet={listing.pets.find((p) => p.id === petPanelId) ?? null} isOwner={isOwner} onClose={() => setPetPanelId(null)} />
      <HomePanel tab={homeTab} onTab={setHomeTab} onClose={() => setHomeTab(null)} home={listing} hostName={hostName} />

      {viewer === "nomad" && openDates.length > 0 && (
        <>
          <CommunityWarningModal
            open={warningOpen}
            onOpenChange={setWarningOpen}
            labels={listingWarning.labels}
            audience="listing"
            continueLabel="Continue to Application"
            onContinue={() => {
              setWarningOpen(false);
              if (invite) handleAcceptInvitation();
              else setApplyDialogOpen(true);
            }}
          />
          <ApplyDialog
            open={applyDialogOpen}
            onOpenChange={setApplyDialogOpen}
            listingId={listing.id}
            listingTitle={listing.title}
            sitDates={selectedSitDates}
            onSuccess={() => setSelectedDateIds([])}
            listingPhoto={listing.photos?.[0] ?? null}
            listingLocation={[listing.city, listing.country].filter(Boolean).join(", ") || null}
            petNames={listing.pets.map((pet) => pet.name).filter(Boolean)}
            otherDates={openDates.filter((d) => !selectedDateIds.includes(d.id))}
            onChooseOtherDates={() => {
              setApplyDialogOpen(false);
              setSelectedDateIds([]);
              // Let the dialog close before scrolling to the date picker.
              setTimeout(scrollToDates, 250);
            }}
          />
        </>
      )}

      <SignUpPromptDialog
        open={promptOpen !== null}
        onOpenChange={(o) => !o && setPromptOpen(null)}
        heart={promptOpen === "save"}
        title={promptOpen === "save" ? "Save sits you love" : "Join NomadNest to see more"}
        message={
          promptOpen === "save"
            ? "Create a free account to save sits and see full profiles. Membership from £59 a year when you are ready to apply."
            : "Create a free account to see full profiles and save sits. Profiles stay members-only to keep everyone safe."
        }
      />

      <PhotoLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        photos={allPhotos}
        startIndex={currentPhotoIndex}
        alt={listing.title}
        onIndexChange={setCurrentPhotoIndex}
      />
      <div className="hidden md:block">
        <Footer />
      </div>
    </RoleTheme>
  );
};

export default ListingDetail;
