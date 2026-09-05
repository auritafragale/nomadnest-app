import { Helmet } from "react-helmet-async";
import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { publicProfiles, type PublicProfile } from "@/lib/publicProfile";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  MapPin,
  Languages,
  Shield,
  CheckCircle,
  Calendar,
  Dog,
  Cat,
  Bird,
  Rabbit,
  Fish,
  Heart,
  Home,
  MessageSquare,
  Send,
  ArrowLeft,
  Mail,
  Clock,
  Award,
  Loader2,
  Star,
  Flag,
  Phone,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { useStartConversation } from "@/hooks/useConversations";
import { SitterReviewsSection } from "@/components/reviews/SitterReviewsSection";
import { useSitterAverageRating, useSitterReviews } from "@/hooks/useSitterReviews";
import CategoryRatingsSummary from "@/components/reviews/CategoryRatingsSummary";
import { aggregateCategoryRatings, SITTER_RATING_CATEGORIES } from "@/lib/categoryRatings";
import ReportDialog from "@/components/reports/ReportDialog";
import { ShareDialog } from "@/components/share/ShareDialog";
import { PhotoLightbox } from "@/components/profile/PhotoLightbox";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import SitterLocationMap from "@/components/maps/SitterLocationMap";
import VerificationBadges from "@/components/ui/VerificationBadges";
import { SITTER_PROFILE_COLUMNS } from "@/lib/profileColumns";
import { formatPetType, petTypeIcon, dedupePetTypes } from "@/lib/petTypes";

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
  age_range: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface Profile {
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  founding_member: boolean | null;
  email_verified: boolean | null;
  phone_verified: boolean | null;
}

interface Listing {
  id: string;
  title: string;
  city: string | null;
  country: string | null;
  sit_dates: { id: string; start_date: string; end_date: string; status: string }[];
}


const SitterDetail = () => {
  const { userId } = useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [sitter, setSitter] = useState<SitterProfile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [selectedListing, setSelectedListing] = useState<string>("");
  const [selectedDateId, setSelectedDateId] = useState<string>("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<number>(0);
  const [photoOpen, setPhotoOpen] = useState(false);

  const [isStartingChat, setIsStartingChat] = useState(false);
  
  const startConversation = useStartConversation();
  const { data: ratingData } = useSitterAverageRating(userId);
  const { data: sitterReviewsForCategories = [] } = useSitterReviews(userId);
  const sitterCategoryAverages = aggregateCategoryRatings(
    sitterReviewsForCategories,
    SITTER_RATING_CATEGORIES
  );

  useEffect(() => {
    const fetchSitterData = async () => {
      if (!userId) return;

      try {
        const [sitterResult, profileResult] = await Promise.all([
          supabase
            .from("sitter_profiles")
            .select(SITTER_PROFILE_COLUMNS as "*")
            .eq("user_id", userId)
            .maybeSingle(),
          publicProfiles("first_name, last_name, avatar_url, city, country, founding_member, email_verified, phone_verified")
            .eq("id", userId)
            .maybeSingle(),
        ]);

        if (sitterResult.error) throw sitterResult.error;
        if (profileResult.error) throw profileResult.error;

        setSitter(sitterResult.data);
        setProfile(profileResult.data as unknown as PublicProfile | null);

        // Fetch user's listings with open sit dates if they're an owner
        if (user) {
          const { data: listingsData } = await supabase
            .from("listings")
            .select(`
              id,
              title,
              city,
              country,
              sit_dates (id, start_date, end_date, status)
            `)
            .eq("owner_user_id", user.id)
            .eq("status", "published");

          if (listingsData) {
            const listingsWithOpenDates = listingsData.filter(
              (l) => l.sit_dates?.some((d: any) => d.status === "open")
            );
            setListings(listingsWithOpenDates as Listing[]);
          }
        }
      } catch (error: any) {
        console.error("Error fetching sitter:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load sitter profile",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSitterData();
  }, [userId, user]);

  const handleInvite = async () => {
    if (!user || !userId || !selectedListing || !selectedDateId) return;

    setSending(true);
    try {
      // Check if an invite already exists for this listing/date combo
      const { data: existingInvite } = await supabase
        .from("sitter_invites")
        .select("id")
        .eq("listing_id", selectedListing)
        .eq("sit_dates_id", selectedDateId)
        .eq("sitter_user_id", userId)
        .maybeSingle();

      if (existingInvite) {
        toast({
          variant: "destructive",
          title: "Already invited",
          description: "You've already invited this sitter for these dates.",
        });
        return;
      }

      const listing = listings.find((l) => l.id === selectedListing);

      // Create the sitter invite
      const { data: invite, error: inviteError } = await supabase
        .from("sitter_invites")
        .insert({
          listing_id: selectedListing,
          sit_dates_id: selectedDateId,
          owner_user_id: user.id,
          sitter_user_id: userId,
          message: inviteMessage || null,
          status: "pending",
        })
        .select("id")
        .single();

      if (inviteError) throw inviteError;

      // Owner display name for notification
      const ownerName =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        "A pet parent";
      // Actually we need the OWNER (current user)'s name — fetch it
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();
      const ownerDisplayName =
        [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(" ") ||
        "A pet parent";

      // The sitter's notification is created by a database trigger on
      // sitter_invites — clients cannot insert notifications directly.



      // Find or create a DIRECT conversation (listing_id = null)
      const { data: existingConvo } = await supabase
        .from("conversations")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("sitter_user_id", userId)
        .eq("conversation_type", "direct")
        .is("listing_id", null)
        .maybeSingle();

      let conversationId = existingConvo?.id;

      if (!conversationId) {
        const { data: newConvo, error: convoError } = await supabase
          .from("conversations")
          .insert({
            owner_user_id: user.id,
            sitter_user_id: userId,
            listing_id: null,
            conversation_type: "direct",
          })
          .select("id")
          .single();

        if (convoError) throw convoError;
        conversationId = newConvo.id;
      }

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_user_id: user.id,
        body: "Hi! I'd love to invite you to sit at my home. I've sent you a formal invitation — please check your notifications.",
      });

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      toast({
        title: "Invitation sent!",
      });

      setShowInviteDialog(false);
      setSelectedListing("");
      setSelectedDateId("");
      setInviteMessage("");
    } catch (error: any) {
      console.error("Error sending invite:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send invitation",
      });
    } finally {
      setSending(false);
    }
  };

  const name = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Sitter"
    : "Sitter";

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const location = profile
    ? [profile.city, profile.country].filter(Boolean).join(", ")
    : null;

  const allPhotos = [
    profile?.avatar_url,
    ...(sitter?.gallery || []),
  ].filter(Boolean) as string[];

  const selectedListingData = listings.find((l) => l.id === selectedListing);
  const availableDates = selectedListingData?.sit_dates.filter(
    (d) => d.status === "open"
  );

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 pt-20 pb-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <Skeleton className="h-10 w-48" />
            <div className="grid md:grid-cols-3 gap-6">
              <Skeleton className="aspect-[3/2] rounded-xl" />
              <div className="md:col-span-2 space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!sitter || !profile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 pt-20 pb-8">
          <div className="max-w-4xl mx-auto text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Sitter not found</h2>
            <p className="text-muted-foreground mb-6">
              This sitter profile doesn't exist or may have been removed.
            </p>
            <Button asChild>
              <Link to="/browse-sitters">Browse Nomads</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const profileUrl = `https://nomadnest.global/sitter/${userId}`;
  const profileTitleMeta = `${name}${location ? ` in ${location}` : ""} | Nomad on NomadNest`.slice(0, 60);
  const profileDescriptionMeta = `Meet ${name}, a Nomad on NomadNest${location ? ` based in ${location}` : ""}. See their experience, reviews and availability for pet and house sits.`.slice(0, 155);

  return (
    <div className="min-h-screen flex flex-col bg-background">
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
            mainEntity: {
              "@type": "Person",
              name,
              address: location || undefined,
            },
          })}
        </script>
      </Helmet>
      <Navbar />
      <main className="flex-1 pt-16">
        <div className="container mx-auto px-4 pt-6 pb-8">
          <div className="max-w-4xl mx-auto">
            {/* Back button */}
            <Button variant="ghost" asChild className="mb-6">
              <Link to="/browse-sitters">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sitters
              </Link>
            </Button>

            {/* Header Section */}
            <div className="grid md:grid-cols-3 gap-6 md:gap-8 mb-6 md:mb-8">
              {/* Photo Gallery — sit-style arrows, tap to open full size */}
              <div className="space-y-3">
                <div className="relative aspect-[3/2] w-56 sm:w-64 md:w-auto mx-auto md:mx-0 rounded-xl overflow-hidden bg-muted">
                  {allPhotos.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPhotoOpen(true)}
                        aria-label="Open photo full size"
                        className="block w-full h-full"
                      >
                        <img
                          src={allPhotos[selectedPhoto]}
                          alt={name}
                          className="w-full h-full object-cover"
                        />
                      </button>
                      {allPhotos.length > 1 && (
                        <>
                          <button
                            type="button"
                            aria-label="Previous photo"
                            onClick={() =>
                              setSelectedPhoto((i) => (i - 1 + allPhotos.length) % allPhotos.length)
                            }
                            className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur p-1.5 shadow hover:bg-background"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Next photo"
                            onClick={() => setSelectedPhoto((i) => (i + 1) % allPhotos.length)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur p-1.5 shadow hover:bg-background"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground">
                            {selectedPhoto + 1}/{allPhotos.length}
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Avatar className="w-full h-full">
                        <AvatarFallback className="text-2xl md:text-4xl">{initials}</AvatarFallback>
                      </Avatar>
                    </div>
                  )}
                </div>

                <PhotoLightbox
                  open={photoOpen}
                  onOpenChange={setPhotoOpen}
                  photos={allPhotos}
                  startIndex={selectedPhoto}
                  alt={name}
                  onIndexChange={setSelectedPhoto}
                />

              </div>

              {/* Profile Info */}
              <div className="md:col-span-2 min-w-0">
                <div className="mb-3">
                  {/* Name + founding badge + report flag on one line */}
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-xl md:text-3xl font-bold truncate">{name}</h1>
                    {profile.founding_member && <FoundingMemberBadge />}
                    {user && user.id !== userId && (
                      <ReportDialog
                        targetType="user"
                        targetId={userId!}
                        targetLabel="sitter"
                        trigger={
                          <Button variant="ghost" size="icon" className="text-muted-foreground shrink-0 h-8 w-8">
                            <Flag className="w-4 h-4" />
                          </Button>
                        }
                      />
                    )}
                  </div>
                  {sitter.headline && (
                    <p className="text-sm md:text-lg text-muted-foreground">
                      {sitter.headline}
                    </p>
                  )}
                  {/* All verification badges on one wrapping row */}
                  <VerificationBadges
                    idVerified={sitter.id_verified}
                    emailVerified={profile?.email_verified}
                    phoneVerified={profile?.phone_verified}
                    backgroundCheck={sitter.background_check}
                    className="mt-2"
                  />
                </div>

                <div className="space-y-1.5 mb-6 text-sm text-muted-foreground">
                  {/* Row 1: location + languages */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    {location && (
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span className="truncate">{location}</span>
                      </div>
                    )}
                    {sitter.languages && sitter.languages.length > 0 && (
                      <div className="flex items-center gap-2 min-w-0">
                        <Languages className="w-4 h-4 shrink-0" />
                        <span className="truncate">{sitter.languages.join(", ")}</span>
                      </div>
                    )}
                  </div>
                  {/* Row 2: reviews + experience */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    {ratingData && ratingData.count > 0 ? (
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        {ratingData.average.toFixed(1)} ({ratingData.count} review{ratingData.count !== 1 ? "s" : ""})
                      </div>
                    ) : ratingData ? (
                      <div className="flex items-center gap-1 text-muted-foreground/70">
                        <Star className="w-4 h-4" />
                        <span className="italic">No reviews yet</span>
                      </div>
                    ) : null}
                    {sitter.experience_level && (
                      <div className="flex items-center gap-2 min-w-0">
                        <Award className="w-4 h-4 shrink-0" />
                        <span className="truncate">{sitter.experience_level}</span>
                      </div>
                    )}
                  </div>
                </div>


                {sitterCategoryAverages.length > 0 && (
                  <CategoryRatingsSummary
                    categories={sitterCategoryAverages}
                    compact={false}
                    className="mb-6 max-w-md"
                  />
                )}


                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {user && user.id !== userId && (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setIsStartingChat(true);
                        try {
                          const { conversationId } = await startConversation.mutateAsync({
                            otherUserId: userId!,
                            conversationType: "direct",
                          });
                          navigate(`/inbox?conversation=${conversationId}`);
                        } catch (error: any) {
                          toast({
                            variant: "destructive",
                            title: "Error",
                            description: error.message || "Failed to start conversation",
                          });
                        } finally {
                          setIsStartingChat(false);
                        }
                      }}
                      disabled={isStartingChat}
                    >
                      {isStartingChat ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <MessageSquare className="w-4 h-4 mr-2" />
                      )}
                      Message
                    </Button>
                  )}
                  {user && user.id !== userId && (role === "owner" || role === "both") && (
                    <Button
                      onClick={() => setShowInviteDialog(true)}
                      disabled={listings.length === 0}
                      title={listings.length === 0 ? "You need a published listing with open dates to invite a sitter" : undefined}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Invite to Sit
                    </Button>
                  )}
                  <ShareDialog 
                    title={`${name} - Pet Sitter`}
                    description={sitter.headline || `Check out ${name}'s pet sitting profile`}
                  />
                </div>



                {/* Pet Types */}
                {sitter.pet_types && sitter.pet_types.length > 0 && (
                  <div className="mb-6">
                    <p className="font-medium mb-2">Experienced with</p>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const pets = dedupePetTypes(sitter.pet_types);
                        const visible = pets.slice(0, 4);
                        const hidden = pets.slice(4);
                        return (
                          <>
                            {visible.map((petType) => {
                              const Icon = petTypeIcon(petType);
                              return (
                                <Badge key={petType} variant="secondary" className="gap-1 capitalize">
                                  <Icon className="w-3 h-3" />
                                  {formatPetType(petType)}
                                </Badge>
                              );
                            })}
                            {hidden.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button type="button" className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-2.5 py-1 text-xs font-medium hover:bg-secondary/80">
                                    +{hidden.length}
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                  {hidden.map((petType) => {
                                    const Icon = petTypeIcon(petType);
                                    return (
                                      <DropdownMenuItem key={petType} className="gap-2 capitalize">
                                        <Icon className="w-3 h-3" />
                                        {formatPetType(petType)}
                                      </DropdownMenuItem>
                                    );
                                  })}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Availability */}
                {(sitter.available_from || sitter.available_to) && (
                  <div className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span className="font-medium">Available:</span>
                      {sitter.available_from && sitter.available_to ? (
                        <span>
                          {format(new Date(sitter.available_from), "MMM d, yyyy")} -{" "}
                          {format(new Date(sitter.available_to), "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span>Flexible dates</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* About Section */}
            {sitter.bio && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle asChild>
                    <h2>About {profile.first_name || "Me"}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {sitter.bio}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Why I Sit */}
            {sitter.why_i_sit && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle asChild>
                    <h2 className="flex items-center gap-2">
                      <Heart className="w-5 h-5 text-primary" />
                      Why I Pet Sit
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {sitter.why_i_sit}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Experience Details */}
            {sitter.experience_details && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle asChild>
                    <h2 className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-primary" />
                      Experience
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {sitter.experience_details}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Preferences Grid */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Sit Style & Comfortable With */}
              <Card>
                <CardHeader>
                  <CardTitle asChild>
                    <h2 className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-primary" />
                      Sitting Style
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sitter.sit_style && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Preferred Style</h4>
                      <p className="text-muted-foreground">{sitter.sit_style}</p>
                    </div>
                  )}
                  {sitter.comfortable_with && sitter.comfortable_with.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Comfortable with</h4>
                      <div className="flex flex-wrap gap-2">
                        {sitter.comfortable_with.map((item) => (
                          <Badge key={item} variant="muted">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Home Preferences */}
              <Card>
                <CardHeader>
                  <CardTitle asChild>
                    <h2 className="flex items-center gap-2">
                      <Home className="w-5 h-5 text-primary" />
                      Home Preferences
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {sitter.home_preferences && sitter.home_preferences.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {sitter.home_preferences.map((pref) => (
                        <Badge key={pref} variant="muted">
                          {pref}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No specific preferences</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Preferred Locations */}
            {(sitter.preferred_regions?.length > 0 ||
              sitter.preferred_countries?.length > 0 ||
              sitter.preferred_cities?.length > 0) && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle asChild>
                    <h2 className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-primary" />
                      Preferred Locations
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {sitter.preferred_regions?.map((region) => (
                      <Badge key={region} variant="outline">
                        {region}
                      </Badge>
                    ))}
                    {sitter.preferred_countries?.map((country) => (
                      <Badge key={country} variant="outline">
                        {country}
                      </Badge>
                    ))}
                    {sitter.preferred_cities?.map((city) => (
                      <Badge key={city} variant="outline">
                        {city}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Location Map */}
            {sitter.latitude && sitter.longitude && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle asChild>
                    <h2 className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      Location
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SitterLocationMap
                    latitude={sitter.latitude}
                    longitude={sitter.longitude}
                    name={profile.first_name || "Sitter"}
                  />
                  {location && (
                    <p className="text-sm text-muted-foreground mt-2">{location}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Reviews Section */}
            <SitterReviewsSection
              sitterUserId={userId!}
              sitterFirstName={profile.first_name}
            />
          </div>
        </div>
      </main>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite {profile.first_name} to Sit</DialogTitle>
            <DialogDescription>
              Select one of your listings and dates to send an invitation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Listing</Label>
              <Select value={selectedListing} onValueChange={(val) => {
                setSelectedListing(val);
                setSelectedDateId("");
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a listing" />
                </SelectTrigger>
                <SelectContent>
                  {listings.map((listing) => (
                    <SelectItem key={listing.id} value={listing.id}>
                      {listing.title} - {listing.city}, {listing.country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedListing && availableDates && availableDates.length > 0 && (
              <div className="space-y-2">
                <Label>Select Dates</Label>
                <Select value={selectedDateId} onValueChange={setSelectedDateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose dates" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDates.map((date) => (
                      <SelectItem key={date.id} value={date.id}>
                        {format(new Date(date.start_date), "MMM d, yyyy")} -{" "}
                        {format(new Date(date.end_date), "MMM d, yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Message (optional)</Label>
              <Textarea
                placeholder="Tell them why you think they'd be a great fit..."
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!selectedListing || !selectedDateId || sending}
            >
              {sending ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default SitterDetail;
