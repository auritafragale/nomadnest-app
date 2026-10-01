import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BackButton } from "@/components/layout/BackButton";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ReviewsList, { type ReviewItem } from "@/components/reviews/ReviewsList";
import { useSitterReviews } from "@/hooks/useSitterReviews";
import { useAuth } from "@/contexts/AuthContext";
import { publicProfiles } from "@/lib/publicProfile";
import { NN_MAIN, RoleTheme, nnButton } from "@/components/nn/ui";

const month = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

/** Reviews of a Nomad, from Pet Parents. First names only. */
const SitterReviews = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { data: reviews = [], isLoading } = useSitterReviews(user ? userId : undefined);
  const { data: firstName = null } = useQuery({
    queryKey: ["review-subject-name", userId],
    queryFn: async () => {
      const { data } = await publicProfiles("first_name").eq("id", userId!).maybeSingle();
      return (data as unknown as { first_name: string | null } | null)?.first_name ?? null;
    },
    enabled: !!user && !!userId,
  });

  const items: ReviewItem[] = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.text,
    name: r.reviewer?.first_name || "A Pet Parent",
    avatarUrl: r.reviewer?.avatar_url ?? null,
    meta: ["Pet Parent", r.sit?.listing?.city, month(r.sit?.dates?.end_date ?? r.created_at)].filter(Boolean).join(" · "),
    listing: r.sit?.listing?.id ? { id: r.sit.listing.id, title: r.sit.listing.title } : null,
    categories: [
      { label: "Pet care", value: r.rating_pet_care },
      { label: "Communication", value: r.rating_communication },
      { label: "Cleanliness", value: r.rating_cleanliness },
      { label: "Reliability", value: r.rating_reliability },
      { label: "Respect for the home", value: r.rating_respect_home },
    ],
  }));

  return (
    <RoleTheme role="owner" className="flex min-h-screen flex-col">
      <Navbar wide />
      <main className={NN_MAIN}>
        <BackButton fallback={`/sitter/${userId}`} label={firstName ? `${firstName}'s profile` : "Back"} className="h-11 self-start" />
        {!authLoading && !user ? (
          <div className="flex flex-col items-center gap-3 rounded-[22px] border border-dashed border-border p-8 text-center">
            <h1 className="text-[20px] font-bold">Sign in to see these reviews</h1>
            <p className="text-[15px] text-muted-foreground">Nomad profiles are only visible to members, to protect their privacy.</p>
            <Link to="/auth" className={nnButton("primary")}>
              Log in or join free
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-[32px] font-normal leading-tight lg:text-[38px]">{firstName ? `Reviews for ${firstName}` : "Reviews"}</h1>
            <div className="md:max-w-3xl">
              <ReviewsList reviews={items} loading={authLoading || isLoading} />
            </div>
          </>
        )}
      </main>
      <Footer />
    </RoleTheme>
  );
};

export default SitterReviews;
