import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { publicProfiles } from "@/lib/publicProfile";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  MapPin,
  ArrowLeft,
  MessageSquare,
  Loader2,
  Star,
  Home,
  Calendar,
  Flag,
  Mail,
  CheckCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useStartConversation } from "@/hooks/useConversations";
import OwnerReviewsSection from "@/components/reviews/OwnerReviewsSection";
import { useOwnerAverageRating, useOwnerReviews } from "@/hooks/useOwnerReviews";
import CategoryRatingsSummary from "@/components/reviews/CategoryRatingsSummary";
import { aggregateCategoryRatings, OWNER_RATING_CATEGORIES } from "@/lib/categoryRatings";
import ReportDialog from "@/components/reports/ReportDialog";

import FoundingMemberBadge from "@/components/ui/FoundingMemberBadge";
import VerificationBadges from "@/components/ui/VerificationBadges";
import { OWNER_PROFILE_COLUMNS } from "@/lib/profileColumns";

interface OwnerProfile {
  id: string;
  user_id: string;
  bio: string | null;
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

const OwnerDetail = () => {
  const { userId } = useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStartingChat, setIsStartingChat] = useState(false);
  
  const startConversation = useStartConversation();
  const ratingData = useOwnerAverageRating(userId);
  const { data: ownerReviewsForCategories = [] } = useOwnerReviews(userId);
  const ownerCategoryAverages = aggregateCategoryRatings(
    ownerReviewsForCategories,
    OWNER_RATING_CATEGORIES
  );

  useEffect(() => {
    const fetchOwnerData = async () => {
      if (!userId) return;

      try {
        const [ownerResult, profileResult, listingsResult] = await Promise.all([
          supabase
            .from("owner_profiles")
            .select(OWNER_PROFILE_COLUMNS as "*")
            .eq("user_id", userId)
            .maybeSingle(),
          publicProfiles("first_name, last_name, avatar_url, city, country, founding_member, email_verified, phone_verified, id_verified")
            .eq("id", userId)
            .maybeSingle(),
          supabase
            .from("listings")
            .select(`
              id,
              title,
              city,
              country,
              photos,
              status,
              pets (id, name, type),
              sit_dates (id, start_date, end_date, status)
            `)
            .eq("owner_user_id", userId)
            .eq("status", "published"),
        ]);

        if (ownerResult.error) throw ownerResult.error;
        if (profileResult.error) throw profileResult.error;
        if (listingsResult.error) throw listingsResult.error;

        setOwnerProfile(ownerResult.data);
        setProfile(profileResult.data as unknown as Profile | null);
        setListings((listingsResult.data || []) as Listing[]);
      } catch (error: any) {
        console.error("Error fetching owner:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load owner profile",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchOwnerData();
  }, [userId]);

  const name = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Owner"
    : "Owner";

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const location = profile
    ? [profile.city, profile.country].filter(Boolean).join(", ")
    : null;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 pt-20 pb-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <Skeleton className="h-10 w-48" />
            <div className="grid md:grid-cols-3 gap-6">
              <Skeleton className="aspect-square rounded-xl" />
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

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 pt-20 pb-8">
          <div className="max-w-4xl mx-auto text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Owner not found</h2>
            <p className="text-muted-foreground mb-6">
              This owner profile doesn't exist or may have been removed.
            </p>
            <Button asChild>
              <Link to="/browse-sits">Browse Listings</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 pt-16">
        <div className="container mx-auto px-4 pt-6 pb-8">
          <div className="max-w-4xl mx-auto">
            {/* Back button */}
            <Button variant="ghost" asChild className="mb-6">
              <Link to="/browse-sits">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Listings
              </Link>
            </Button>

            {/* Header Section */}
            <div className="grid md:grid-cols-3 gap-6 md:gap-8 mb-8">
              {/* Avatar + share */}
              <div className="space-y-3">
                <div className="relative aspect-square w-28 md:w-auto mx-auto md:mx-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Avatar className="w-full h-full">
                      <AvatarFallback className="text-2xl md:text-4xl">{initials}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
                {/* Sharing lives on the listing page, which links here */}
              </div>

              {/* Profile Info */}
              <div className="md:col-span-2 min-w-0">
                <div className="mb-3">
                  {/* Name, founding badge and report flag share a line */}
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-xl md:text-3xl font-bold truncate">{name}</h1>
                    {profile.founding_member && <FoundingMemberBadge />}
                    {user && user.id !== userId && (
                      <ReportDialog
                        targetType="user"
                        targetId={userId!}
                        targetLabel="owner"
                        trigger={
                          <Button variant="ghost" size="icon" className="text-muted-foreground shrink-0 h-8 w-8">
                            <Flag className="w-4 h-4" />
                          </Button>
                        }
                      />
                    )}
                  </div>
                  <p className="text-sm md:text-lg text-muted-foreground">Pet Parent</p>
                  {/* All verification badges on one wrapping row */}
                  <VerificationBadges
                    idVerified={profile.id_verified}
                    emailVerified={profile.email_verified}
                    phoneVerified={profile.phone_verified}
                    className="mt-2"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6 text-sm text-muted-foreground">
                  {location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {location}
                    </div>
                  )}
                  {ratingData && ratingData.reviewCount > 0 ? (
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      {ratingData.averageRating.toFixed(1)} ({ratingData.reviewCount} review{ratingData.reviewCount !== 1 ? "s" : ""})
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-muted-foreground/70">
                      <Star className="w-4 h-4" />
                      <span className="italic">No reviews yet</span>
                    </div>
                  )}
                </div>



                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {user && user.id !== userId && (role === "sitter" || role === "both") && (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setIsStartingChat(true);
                        try {
                          const { conversationId } = await startConversation.mutateAsync({
                            otherUserId: userId!,
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
                </div>


                {/* Bio */}
                {ownerProfile?.bio && (
                  <div>
                    <h3 className="font-medium mb-2">About</h3>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {ownerProfile.bio}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Listings */}
            {listings.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Home className="w-5 h-5" />
                    Active Listings
                    <Badge variant="secondary" className="ml-auto">{listings.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {listings.map((listing) => {
                      const openDates = listing.sit_dates.filter((d) => d.status === "open");
                      const nextDate = openDates.length > 0
                        ? openDates.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())[0]
                        : null;

                      return (
                        <Link
                          key={listing.id}
                          to={`/listing/${listing.id}`}
                          className="flex gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                        >
                          <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                            {listing.photos?.[0] ? (
                              <img
                                src={listing.photos[0]}
                                alt={listing.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Home className="w-8 h-8 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{listing.title}</h4>
                            {listing.city && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {[listing.city, listing.country].filter(Boolean).join(", ")}
                              </p>
                            )}
                            {nextDate && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(nextDate.start_date), "MMM d")} - {format(new Date(nextDate.end_date), "MMM d, yyyy")}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {listing.pets.length} pet{listing.pets.length !== 1 ? "s" : ""} • {openDates.length} open date{openDates.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reviews Section */}
            {userId && <OwnerReviewsSection ownerUserId={userId} />}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default OwnerDetail;
