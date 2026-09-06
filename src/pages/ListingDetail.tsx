import { Helmet } from "react-helmet-async";
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Wifi,
  Home,
  Bed,
  Dog,
  Cat,
  Bird,
  Fish,
  Rabbit,
  Pill,
  Check,
  MessageSquare,
  Clock,
  ChevronLeft,
  ChevronRight,
  User,
  Loader2,
  Flag,
  Heart,
  Share2,
} from "lucide-react";
import { ShareDialog } from "@/components/share/ShareDialog";
import { supabase } from "@/integrations/supabase/client";
import { publicProfiles } from "@/lib/publicProfile";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/layout/Navbar";
import { ApplyDialog } from "@/components/applications/ApplyDialog";
import CommunityWarningModal from "@/components/trust/CommunityWarningModal";
import { useCommunityWarning } from "@/hooks/useCommunityWarning";
import { format, parseISO, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useStartConversation } from "@/hooks/useConversations";
import OwnerReviewsSection from "@/components/reviews/OwnerReviewsSection";
import { useOwnerAverageRating } from "@/hooks/useOwnerReviews";
import { Star, BookOpen } from "lucide-react";
import ReportDialog from "@/components/reports/ReportDialog";
import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import ListingLocationMap from "@/components/maps/ListingLocationMap";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPetType, petTypeIcon, formatPetAge } from "@/lib/petTypes";
import VerificationBadges from "@/components/ui/VerificationBadges";
import InlineWelcomeGuide from "@/components/listing/InlineWelcomeGuide";
import { useAcceptedSitter } from "@/hooks/useAcceptedSitter";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { PhotoLightbox } from "@/components/profile/PhotoLightbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Pet {
  id: string;
  name: string;
  type: string;
  age: string | null;
  personality: string | null;
  feeding_details: string | null;
  daily_routine: string | null;
  walks_exercise: string | null;
  has_medication: boolean;
  medication_instructions: string | null;
  vet_info: string | null;
  photos: string[];
  requires_medication: boolean;
  reactive_to_animals: boolean;
  separation_anxiety_tolerance: string | null;
}

interface SitDate {
  id: string;
  start_date: string;
  end_date: string;
  flexibility: string | null;
  handover_preference: string | null;
  status: string;
}

interface Profile {
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  founding_member: boolean | null;
  full_name: string | null;
  id_verified?: boolean | null;
}

interface Listing {
  id: string;
  title: string;
  description: string | null;
  city: string;
  country: string;
  area: string | null;
  home_type: string | null;
  wifi_quality: string | null;
  sleeping_arrangement: string | null;
  amenities: string[];
  photos: string[];
  requirements: string[];
  requirements_other: string | null;
  house_rules: string[];
  house_rules_other: string | null;
  home_care_tasks: string[];
  home_care_tasks_other: string | null;
  ideal_sitter_description: string | null;
  communication_style: string | null;
  owner_user_id: string;
  remote_location?: boolean | null;
  car_needed?: boolean | null;
  heavy_gardening?: boolean | null;
  latitude: number | null;
  longitude: number | null;
  pets: Pet[];
  sit_dates: SitDate[];
  profiles: Profile;
}


// Owner Card with Message Button
const OwnerCard = ({
  listing,
  ownerName,
  isOwner,
  user,
  role,
}: {
  listing: Listing;
  ownerName: string;
  isOwner: boolean;
  user: any;
  role: string | null;
}) => {
  const { averageRating, reviewCount } = useOwnerAverageRating(listing.owner_user_id);


  return (
    <Card>
      <CardContent className="pt-6">
        <Link to={`/owner/${listing.owner_user_id}`} className="flex items-center gap-4 mb-4 group">
          <Avatar className="w-14 h-14">
            <AvatarImage src={listing.profiles?.avatar_url || ""} />
            <AvatarFallback>
              <User className="w-6 h-6" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold group-hover:text-primary transition-colors">{ownerName}</h3>
            <p className="text-sm text-muted-foreground">Pet Parent</p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <VerificationBadges idVerified={listing.profiles?.id_verified} />
              {listing.profiles?.founding_member && <FoundingMemberBadge compact />}
            </div>
            {reviewCount > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">{averageRating}</span>
                <span className="text-xs text-muted-foreground">({reviewCount} reviews)</span>
              </div>
            )}
          </div>
        </Link>
        {listing.communication_style && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <MessageSquare className="w-4 h-4" />
            Prefers {listing.communication_style.replace(/_/g, " ")} updates
          </div>
        )}
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            asChild
          >
            <Link to={`/owner/${listing.owner_user_id}`}>
              <User className="w-4 h-4 mr-2" />
              View Profile
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const ListingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedDateIds, setSelectedDateIds] = useState<string[]>([]);
  const [warningOpen, setWarningOpen] = useState(false);
  const listingWarning = useCommunityWarning("listing", id);

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
            "id, owner_user_id, title, description, city, country, area, " +
            "home_type, sleeping_arrangement, amenities, wifi_quality, " +
            "house_rules, house_rules_other, home_care_tasks, home_care_tasks_other, " +
            "requirements, requirements_other, communication_style, " +
            "ideal_sitter_description, photos, status, latitude, longitude, " +
            "remote_location, car_needed, heavy_gardening, " +
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

        const listingRow = listingData as any;

        // Fetch pets and sit_dates
        const [petsResult, datesResult, profileResult] = await Promise.all([
          supabase.from("pets").select("*").eq("listing_id", id),
          supabase.from("sit_dates").select("*").eq("listing_id", id),
          publicProfiles("first_name, last_name, avatar_url, city, country, founding_member, full_name, id_verified")
            .eq("id", listingRow.owner_user_id)
            .maybeSingle(),
        ]);

        setListing({
          ...listingRow,
          pets: petsResult.data || [],
          sit_dates: datesResult.data || [],
          profiles: profileResult.data || null,
        } as unknown as Listing);
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
  }, [id, navigate, toast]);

  const allPhotos = listing
    ? [
        ...listing.photos,
        ...listing.pets.flatMap((pet) => pet.photos || []),
      ]
    : [];

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) =>
      prev === allPhotos.length - 1 ? 0 : prev + 1
    );
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) =>
      prev === 0 ? allPhotos.length - 1 : prev - 1
    );
  };

  const openDates = listing?.sit_dates.filter((d) => d.status === "open") || [];
  const selectedSitDates = openDates.filter((d) => selectedDateIds.includes(d.id));
  const toggleDate = (id: string) =>
    setSelectedDateIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  const isOwner = user?.id === listing?.owner_user_id;
  const { data: acceptedSitter = false } = useAcceptedSitter(listing?.id);
  const [petDialogId, setPetDialogId] = useState<string | null>(null);
  const canApply = user && !isOwner && (role === "sitter" || role === "both");

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-16 pb-8">
          <div className="container mx-auto px-4 max-w-5xl">
            <Skeleton className="h-8 w-48 mb-6" />
            <Skeleton className="aspect-video w-full rounded-xl mb-6" />
            <Skeleton className="h-10 w-3/4 mb-4" />
            <Skeleton className="h-6 w-1/2 mb-8" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!listing) return null;

  const ownerName = listing.profiles?.first_name
    ? `${listing.profiles.first_name} ${listing.profiles.last_name || ""}`.trim()
    : "Pet Owner";

  const listingUrl = `https://nomadnest.global/listing/${listing.id}`;
  const listingTitleMeta = `${listing.title} | Pet Sit in ${listing.city || listing.country || "the world"}`.slice(0, 60);
  const listingDescriptionMeta = (listing.description || `A house and pet sit in ${[listing.city, listing.country].filter(Boolean).join(", ")} on NomadNest.`)
    .replace(/\s+/g, " ")
    .slice(0, 155);

  return (
    <div className="min-h-screen bg-background">
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
      <Navbar />

      <main className="pt-16 pb-8 md:pb-12">
        <div className="container mx-auto px-4 max-w-5xl">
          {/* Back Button */}
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-4 md:mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {/* Photo Gallery */}
          {allPhotos.length > 0 ? (
            <div className="relative aspect-video rounded-xl overflow-hidden bg-muted mb-6 group">
              <img
                src={allPhotos[currentPhotoIndex]}
                alt={`Photo ${currentPhotoIndex + 1}`}
                className="w-full h-full object-cover cursor-zoom-in"
                onClick={() => setLightboxOpen(true)}
              />
              {/* Share — top left, plain icon */}
              <div className="absolute top-3 left-3">
                <ShareDialog
                  title={listing.title}
                  description={`Check out this pet sitting opportunity in ${listing.city}, ${listing.country}`}
                  triggerClassName="bg-background/80 hover:bg-background backdrop-blur-sm rounded-full shadow-sm border-0"
                />
              </div>
              {/* Favourite — top right */}
              {user && !isOwner && (
                <button
                  type="button"
                  onClick={() => toggleFavorite.mutate({ listingId: listing.id, isFavorited })}
                  aria-label={isFavorited ? "Remove from saved" : "Save listing"}
                  className="absolute top-3 right-3 p-2 bg-background/80 hover:bg-background backdrop-blur-sm rounded-full shadow-sm transition-colors"
                >
                  <Heart
                    className={cn(
                      "w-5 h-5 transition-colors",
                      isFavorited ? "fill-primary text-primary" : "text-foreground",
                    )}
                  />
                </button>
              )}
              {allPhotos.length > 1 && (
              <>
                  <button
                    onClick={prevPhoto}
                    aria-label="Previous photo"
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-3 bg-background/80 rounded-full hover:bg-background transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextPhoto}
                    aria-label="Next photo"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-background/80 rounded-full hover:bg-background transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                    {allPhotos.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentPhotoIndex(idx)}
                        aria-label={`Go to photo ${idx + 1} of ${allPhotos.length}`}
                        aria-current={idx === currentPhotoIndex}
                        className="p-1.5"
                      >
                        <span className={cn(
                          "block w-2 h-2 rounded-full transition-colors",
                          idx === currentPhotoIndex
                            ? "bg-primary"
                            : "bg-background/60"
                        )} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="aspect-video rounded-xl bg-muted flex items-center justify-center mb-6">
              <Home className="w-16 h-16 text-muted-foreground/50" />
            </div>
          )}

          {/* Title & Location */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-2">
                  {listing.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    {listing.city}, {listing.country}
                  </span>
                  {listing.area && (
                    <span className="text-sm">• {listing.area}</span>
                  )}
                </div>
              </div>
              {user && !isOwner && (
                <ReportDialog
                  targetType="listing"
                  targetId={listing.id}
                  targetLabel={listing.title}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Report listing"
                    >
                      <Flag className="h-5 w-5" />
                    </Button>
                  }
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Welcome Guide — shown to the owner or an accepted Nomad */}
              {(isOwner || acceptedSitter) && (
                <InlineWelcomeGuide ownerUserId={listing.owner_user_id} listingId={listing.id} />
              )}

              {/* Description */}
              {listing.description && (
                <Card>
                  <CardHeader>
                  <CardTitle asChild>
                    <h2>About this sit</h2>
                  </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {listing.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Pets — one tab per pet */}
              {listing.pets.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle asChild>
                      <h2 className="flex items-center gap-2">
                        <Dog className="w-5 h-5" />
                        Meet the Pets ({listing.pets.length})
                      </h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue={listing.pets[0].id}>
                      <TabsList className="w-full flex-wrap h-auto justify-start">
                        {listing.pets.map((pet) => {
                          const PetIcon = petTypeIcon(pet.type);
                          return (
                            <TabsTrigger key={pet.id} value={pet.id} className="gap-1.5">
                              <PetIcon className="w-3.5 h-3.5" />
                              {pet.name || formatPetType(pet.type)}
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>

                      {listing.pets.map((pet) => {
                        const PetIcon = petTypeIcon(pet.type);
                        const age = formatPetAge(pet.age);
                        return (
                          <TabsContent key={pet.id} value={pet.id} className="mt-4">
                            <button
                              type="button"
                              onClick={() => setPetDialogId(pet.id)}
                              className="w-full text-left flex items-start gap-4 rounded-lg p-2 -m-2 hover:bg-muted/50 transition-colors"
                            >
                              {pet.photos?.[0] ? (
                                <img
                                  src={pet.photos[0]}
                                  alt={pet.name || formatPetType(pet.type)}
                                  className="w-20 h-20 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
                                  <PetIcon className="w-8 h-8 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <h3 className="font-semibold text-lg">{pet.name}</h3>
                                  <Badge variant="secondary">{formatPetType(pet.type)}</Badge>
                                  {age && (
                                    <span className="text-sm text-muted-foreground">{age}</span>
                                  )}
                                  {pet.has_medication && (
                                    <Badge variant="outline" className="gap-1">
                                      <Pill className="w-3 h-3" />
                                      Medication
                                    </Badge>
                                  )}
                                </div>
                                {pet.personality && (
                                  <p className="text-muted-foreground text-sm mb-2">
                                    {pet.personality}
                                  </p>
                                )}
                                <span className="text-xs text-primary font-medium">
                                  Tap to view full profile & photos
                                </span>
                              </div>
                            </button>
                          </TabsContent>
                        );
                      })}
                    </Tabs>
                  </CardContent>
                </Card>
              )}

              {/* Pet detail dialog */}
              <Dialog open={!!petDialogId} onOpenChange={(o) => !o && setPetDialogId(null)}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                  {(() => {
                    const pet = listing.pets.find((p) => p.id === petDialogId);
                    if (!pet) return null;
                    const PetIcon = petTypeIcon(pet.type);
                    return (
                      <>
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <PetIcon className="w-5 h-5 text-primary" />
                            {pet.name || formatPetType(pet.type)}
                          </DialogTitle>
                        </DialogHeader>
                        {pet.photos?.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 mb-4">
                            {pet.photos.map((photo, i) => (
                              <img
                                key={i}
                                src={photo}
                                alt={`${pet.name || "Pet"} ${i + 1}`}
                                className="w-full h-32 rounded-lg object-cover"
                              />
                            ))}
                          </div>
                        )}
                        <div className="space-y-3 text-sm">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">{formatPetType(pet.type)}</Badge>
                            {pet.age && <Badge variant="outline">{pet.age}</Badge>}
                            {pet.has_medication && (
                              <Badge variant="outline" className="gap-1">
                                <Pill className="w-3 h-3" /> Medication
                              </Badge>
                            )}
                            {pet.reactive_to_animals && (
                              <Badge variant="outline">Reactive to animals</Badge>
                            )}
                          </div>
                          {pet.personality && (
                            <div>
                              <p className="font-medium mb-1">Personality</p>
                              <p className="text-muted-foreground">{pet.personality}</p>
                            </div>
                          )}
                          {pet.daily_routine && (
                            <div>
                              <p className="font-medium mb-1">Daily routine</p>
                              <p className="text-muted-foreground">{pet.daily_routine}</p>
                            </div>
                          )}
                          {pet.feeding_details && (
                            <div>
                              <p className="font-medium mb-1">Feeding details</p>
                              <p className="text-muted-foreground">{pet.feeding_details}</p>
                            </div>
                          )}
                          {pet.walks_exercise && (
                            <div>
                              <p className="font-medium mb-1">Walks & exercise</p>
                              <p className="text-muted-foreground">{pet.walks_exercise}</p>
                            </div>
                          )}
                          {pet.requires_medication && pet.medication_instructions && (
                            <div>
                              <p className="font-medium mb-1">Medication instructions</p>
                              <p className="text-muted-foreground">{pet.medication_instructions}</p>
                            </div>
                          )}
                          {pet.vet_info && (
                            <div>
                              <p className="font-medium mb-1">Vet info</p>
                              <p className="text-muted-foreground">{pet.vet_info}</p>
                            </div>
                          )}
                          {pet.separation_anxiety_tolerance && (
                            <div>
                              <p className="font-medium mb-1">Separation anxiety tolerance</p>
                              <p className="text-muted-foreground">{pet.separation_anxiety_tolerance}</p>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </DialogContent>
              </Dialog>

              {/* Home & Requirements — tabbed */}
              <Card>
                <CardHeader>
                  <CardTitle asChild>
                    <h2 className="flex items-center gap-2">
                      <Home className="w-5 h-5" />
                      The Home &amp; What&apos;s Expected
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="home">
                    <TabsList className="w-full flex-wrap h-auto justify-start">
                      <TabsTrigger value="home">Home details</TabsTrigger>
                      <TabsTrigger value="requirements">Requirements &amp; rules</TabsTrigger>
                    </TabsList>

                    <TabsContent value="home" className="mt-4 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {listing.home_type && (
                          <div className="flex items-center gap-2">
                            <Home className="w-4 h-4 text-muted-foreground" />
                            <span className="capitalize">{listing.home_type}</span>
                          </div>
                        )}
                        {listing.wifi_quality && (
                          <div className="flex items-center gap-2">
                            <Wifi className="w-4 h-4 text-muted-foreground" />
                            <span className="capitalize">
                              {listing.wifi_quality.replace("_", " ")} WiFi
                            </span>
                          </div>
                        )}
                        {listing.sleeping_arrangement && (
                          <div className="flex items-center gap-2">
                            <Bed className="w-4 h-4 text-muted-foreground" />
                            <span className="capitalize">
                              {listing.sleeping_arrangement.replace(/_/g, " ")}
                            </span>
                          </div>
                        )}
                      </div>

                      {(listing.remote_location || listing.car_needed || listing.heavy_gardening) && (
                        <>
                          <Separator />
                          <div>
                            <h4 className="font-medium mb-2">Good to know</h4>
                            <div className="flex flex-wrap gap-2">
                              {listing.remote_location && <Badge variant="secondary">Remote location</Badge>}
                              {listing.car_needed && <Badge variant="secondary">Car needed</Badge>}
                              {listing.heavy_gardening && <Badge variant="secondary">Plant Care</Badge>}
                            </div>
                          </div>
                        </>
                      )}

                      {listing.amenities.length > 0 && (
                        <>
                          <Separator />
                          <div>
                            <h4 className="font-medium mb-2">Amenities</h4>
                            <div className="flex flex-wrap gap-2">
                              {listing.amenities.map((amenity) => (
                                <Badge key={amenity} variant="secondary">
                                  {amenity}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="requirements" className="mt-4 space-y-4">
                      {listing.requirements.length === 0 &&
                      listing.house_rules.length === 0 &&
                      listing.home_care_tasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No specific requirements listed.
                        </p>
                      ) : (
                        <>
                          {listing.requirements.length > 0 && (
                            <div>
                              <h4 className="font-medium mb-2">Nomad Requirements</h4>
                              <ul className="space-y-1">
                                {listing.requirements.map((req) => (
                                  <li key={req} className="flex items-center gap-2 text-sm">
                                    <Check className="w-4 h-4 text-primary" />
                                    {req}
                                  </li>
                                ))}
                              </ul>
                              {listing.requirements_other && (
                                <p className="text-sm text-muted-foreground mt-2">
                                  {listing.requirements_other}
                                </p>
                              )}
                            </div>
                          )}

                          {listing.house_rules.length > 0 && (
                            <>
                              <Separator />
                              <div>
                                <h4 className="font-medium mb-2">House Rules</h4>
                                <ul className="space-y-1">
                                  {listing.house_rules.map((rule) => (
                                    <li key={rule} className="flex items-center gap-2 text-sm">
                                      <Check className="w-4 h-4 text-primary" />
                                      {rule}
                                    </li>
                                  ))}
                                </ul>
                                {listing.house_rules_other && (
                                  <p className="text-sm text-muted-foreground mt-2">
                                    {listing.house_rules_other}
                                  </p>
                                )}
                              </div>
                            </>
                          )}

                          {listing.home_care_tasks.length > 0 && (
                            <>
                              <Separator />
                              <div>
                                <h4 className="font-medium mb-2">Home Care Tasks</h4>
                                <ul className="space-y-1">
                                  {listing.home_care_tasks.map((task) => (
                                    <li key={task} className="flex items-center gap-2 text-sm">
                                      <Check className="w-4 h-4 text-secondary" />
                                      {task}
                                    </li>
                                  ))}
                                </ul>
                                {listing.home_care_tasks_other && (
                                  <p className="text-sm text-muted-foreground mt-2">
                                    {listing.home_care_tasks_other}
                                  </p>
                                )}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>


              {/* Location Map */}
              {listing.latitude && listing.longitude && (
                <Card>
                  <CardHeader>
                    <CardTitle asChild>
                      <h2 className="flex items-center gap-2">
                        <MapPin className="w-5 h-5" />
                        Location
                      </h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ListingLocationMap
                      latitude={listing.latitude}
                      longitude={listing.longitude}
                      title={listing.title}
                    />
                    <p className="text-sm text-muted-foreground mt-2">
                      {[listing.area, listing.city, listing.country].filter(Boolean).join(", ")}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Owner Card */}
              <OwnerCard 
                listing={listing}
                ownerName={ownerName}
                isOwner={isOwner}
                user={user}
                role={role}
              />

              {/* Owner Reviews */}
              <OwnerReviewsSection ownerUserId={listing.owner_user_id} />
              <Card>
                <CardHeader>
                  <CardTitle asChild>
                    <h2 className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      Available Dates
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {openDates.length > 0 ? (
                    openDates.map((sitDate) => {
                      const days = differenceInDays(
                        parseISO(sitDate.end_date),
                        parseISO(sitDate.start_date)
                      );
                      return (
                        <div
                          key={sitDate.id}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-all",
                            selectedDateIds.includes(sitDate.id)
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => toggleDate(sitDate.id)}
                        >
                          <div className="font-medium">
                            {format(parseISO(sitDate.start_date), "MMM d")} -{" "}
                            {format(parseISO(sitDate.end_date), "MMM d, yyyy")}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {days} {days === 1 ? "night" : "nights"}
                          </div>
                          {sitDate.flexibility && (
                            <Badge variant="outline" className="mt-2 text-xs">
                              {sitDate.flexibility.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No available dates at the moment
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Apply Button */}
              {canApply && openDates.length > 0 && (
                <>
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={() =>
                      listingWarning.hasWarning
                        ? setWarningOpen(true)
                        : setApplyDialogOpen(true)
                    }
                    disabled={selectedDateIds.length === 0}
                  >
                    {selectedDateIds.length === 0
                      ? "Select dates to apply"
                      : selectedDateIds.length === 1
                        ? "Apply for this Sit"
                        : `Apply for ${selectedDateIds.length} date ranges`}
                  </Button>
                  <CommunityWarningModal
                    open={warningOpen}
                    onOpenChange={setWarningOpen}
                    labels={listingWarning.labels}
                    audience="listing"
                    continueLabel="Continue to Application"
                    onContinue={() => {
                      setWarningOpen(false);
                      setApplyDialogOpen(true);
                    }}
                  />
                  <ApplyDialog
                    open={applyDialogOpen}
                    onOpenChange={setApplyDialogOpen}
                    listingId={listing.id}
                    listingTitle={listing.title}
                    sitDates={selectedSitDates}
                    onSuccess={() => setSelectedDateIds([])}
                  />
                </>
              )}

              {!user && (
                <Link to="/auth">
                  <Button className="w-full" size="lg" variant="outline">
                    Sign in to Apply
                  </Button>
                </Link>
              )}

              {isOwner && (
                <>
                  <Button className="w-full" size="lg" variant="outline" disabled>
                    This is your listing
                  </Button>
                  <Link to={`/listing/${listing.id}/welcome-guide`}>
                    <Button className="w-full mt-2" size="lg" variant="secondary">
                      <BookOpen className="w-4 h-4 mr-2" />
                      Welcome Guide
                    </Button>
                  </Link>
                </>
              )}

              {/* Report Button */}
              {user && !isOwner && (
                <div className="flex justify-center pt-2">
                  <ReportDialog
                    targetType="listing"
                    targetId={listing.id}
                    targetLabel="listing"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ListingDetail;
