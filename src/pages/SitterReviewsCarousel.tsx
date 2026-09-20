import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { ArrowLeft, Star, User, Calendar, Users } from "lucide-react";
import { format } from "date-fns";
import { useSitterReviews } from "@/hooks/useSitterReviews";
import { useAuth } from "@/contexts/AuthContext";

const StarRowLight = ({ rating }: { rating: number }) => (
  <div className="flex items-center gap-1">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        className={`w-5 h-5 ${star <= rating ? "fill-white text-white" : "text-white/30"}`}
      />
    ))}
  </div>
);

const StarRow = ({ rating }: { rating: number }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        className={`w-3.5 h-3.5 ${
          star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"
        }`}
      />
    ))}
  </div>
);

const SitterReviewsCarousel = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: reviews = [], isLoading } = useSitterReviews(user ? userId : undefined);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    onSelect();
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 pt-20 pb-8">
          <div className="max-w-md mx-auto text-center py-12">
            <Users className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Sign in to view this profile</h2>
            <p className="text-muted-foreground mb-6">
              Nomad profiles are only visible to members, to protect their privacy.
            </p>
            <Button asChild>
              <Link to="/auth">Log in or create a profile</Link>
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
        <div className="container mx-auto px-4 pt-6 pb-12 max-w-2xl">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <h1 className="text-xl md:text-2xl font-bold mb-4">Reviews</h1>

          {isLoading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : reviews.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                No reviews yet.
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                {current + 1} of {reviews.length}
              </p>
              <Carousel setApi={setApi} opts={{ align: "start" }} className="w-full">
                <CarouselContent>
                  {reviews.map((review) => {
                    const reviewerName =
                      [review.reviewer?.first_name, review.reviewer?.last_name]
                        .filter(Boolean)
                        .join(" ") || "A Pet Parent";

                    const breakdown = (
                      [
                        { label: "Pet Care", value: review.rating_pet_care },
                        { label: "Communication", value: review.rating_communication },
                        { label: "Cleanliness", value: review.rating_cleanliness },
                        { label: "Reliability", value: review.rating_reliability },
                        { label: "Respect for Home", value: review.rating_respect_home },
                      ] as { label: string; value: number | null }[]
                    ).filter(
                      (b): b is { label: string; value: number } => b.value != null
                    );

                    return (
                      <CarouselItem key={review.id}>
                        <Card className="overflow-hidden">
                          <div className="bg-primary text-primary-foreground px-6 py-8 text-center space-y-3">
                            <div className="flex justify-center">
                              <StarRowLight rating={review.rating} />
                            </div>
                            <Avatar className="w-16 h-16 mx-auto ring-2 ring-white/40">
                              <AvatarImage src={review.reviewer?.avatar_url || undefined} />
                              <AvatarFallback className="bg-white/20 text-primary-foreground">
                                <User className="w-7 h-7" />
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{reviewerName}</p>
                              <p className="text-sm text-primary-foreground/80">Pet Parent</p>
                            </div>
                            {review.sit?.dates && (
                              <p className="flex items-center justify-center gap-1.5 text-sm text-primary-foreground/80">
                                <Calendar className="w-3.5 h-3.5" />
                                {format(new Date(review.sit.dates.start_date), "MMM d")} –{" "}
                                {format(new Date(review.sit.dates.end_date), "MMM d, yyyy")}
                              </p>
                            )}
                          </div>
                          <CardContent className="space-y-5 pt-6">
                            {review.text ? (
                              <p className="text-sm whitespace-pre-wrap">{review.text}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">
                                No written feedback left for this sit.
                              </p>
                            )}
                            {breakdown.length > 0 && (
                              <div className="space-y-2 pt-4 border-t border-border">
                                {breakdown.map((b) => (
                                  <div
                                    key={b.label}
                                    className="flex items-center justify-between gap-3"
                                  >
                                    <span className="text-sm text-muted-foreground">
                                      {b.label}
                                    </span>
                                    <StarRow rating={b.value} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </CarouselItem>
                    );
                  })}
                </CarouselContent>
                {reviews.length > 1 && (
                  <>
                    <CarouselPrevious className="left-1 sm:-left-4" />
                    <CarouselNext className="right-1 sm:-right-4" />
                  </>
                )}
              </Carousel>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SitterReviewsCarousel;
