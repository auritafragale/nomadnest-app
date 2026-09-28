import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BookHeart, Check, Download, Loader2, Share2, Star, UserRound, X } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";
import { toast } from "sonner";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import WriteReviewDialog from "@/components/reviews/WriteReviewDialog";
import { cn } from "@/lib/utils";
import { useSitStory, useSitStoryActions, type SitStory as SitStoryData } from "@/hooks/useSitStories";
import { useUpdatePhotoUrls } from "@/hooks/useDailyUpdates";
import { PhotoPicker } from "@/components/stories/StoryShare";
import { ParentStoryView } from "@/components/stories/ParentStoryView";
import { RoleTheme } from "@/components/nn/ui";

const PortfolioPanel = ({ story, urls }: { story: SitStoryData; urls: Record<string, string> }) => {
  const { requestPortfolio, decidePortfolio, removePortfolioPhoto } = useSitStoryActions(story.id);
  const [picked, setPicked] = useState<string[]>(story.portfolio_photo_paths ?? []);
  const isOwner = story.role === "owner";
  const status = story.portfolio_status;
  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast.success(ok)).catch((err: Error) => toast.error(err.message || "That didn't work. Please try again."));

  if (story.status !== "ready" || !story.owner_user_id || !story.sitter_user_id) return null;

  return (
    <section className="space-y-3 rounded-3xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="portfolio-heading">
      <h2 id="portfolio-heading" className="flex items-center gap-2 font-display text-lg font-bold">
        <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />
        {isOwner ? `On ${story.sitter_first_name}'s profile` : "On your profile"}
      </h2>

      {isOwner ? (
        status === "requested" ? (
          <>
            <p className="text-sm text-muted-foreground">
              {story.sitter_first_name} would like to show this story on their profile. Choose up to 2 photos to show
              with it, or none. Once approved, the story stays on their profile; you can remove its photos at any time.
            </p>
            <PhotoPicker paths={story.photo_paths} urls={urls} selected={picked} max={2} onChange={setPicked} />
            <div className="flex flex-wrap gap-2">
              <Button
                className="rounded-full"
                disabled={decidePortfolio.isPending}
                onClick={() => run(decidePortfolio.mutateAsync({ decision: "approve", photoPaths: picked }), "Approved")}
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                disabled={decidePortfolio.isPending}
                onClick={() => run(decidePortfolio.mutateAsync({ decision: "decline" }), "Declined")}
              >
                Decline
              </Button>
            </div>
          </>
        ) : status === "approved" ? (
          <>
            <p className="text-sm text-muted-foreground">
              This story is on {story.sitter_first_name}'s profile. You can remove any of its photos from their profile at
              any time; the story itself stays.
            </p>
            {(story.portfolio_photo_paths ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No photos are shown with it.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {story.portfolio_photo_paths.map((p) => (
                  <div key={p} className="relative">
                    {urls[p] ? (
                      <img src={urls[p]} alt="" className="aspect-square w-full rounded-2xl object-cover" />
                    ) : (
                      <div className="aspect-square w-full rounded-2xl bg-muted" />
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="absolute bottom-2 left-1/2 h-8 -translate-x-1/2 rounded-full px-3 text-xs shadow"
                      disabled={removePortfolioPhoto.isPending}
                      onClick={() => run(removePortfolioPhoto.mutateAsync(p), "Photo removed from their profile")}
                    >
                      <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            It's private to the two of you. {story.sitter_first_name} can ask to show it on their profile, and you decide.
          </p>
        )
      ) : status === "approved" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">It's on your profile, approved by {story.owner_first_name}.</p>
          <Button variant="ghost" size="sm" className="rounded-full" disabled={requestPortfolio.isPending}
            onClick={() => run(requestPortfolio.mutateAsync(false), "Removed from your profile")}>
            Remove it
          </Button>
        </div>
      ) : status === "revoked" ? (
        <p className="text-sm text-muted-foreground">
          {story.owner_first_name} took this story off your profile, so it can't be added again.
        </p>
      ) : status === "requested" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">Waiting for {story.owner_first_name} to approve.</p>
          <Button variant="ghost" size="sm" className="rounded-full" disabled={requestPortfolio.isPending}
            onClick={() => run(requestPortfolio.mutateAsync(false), "Request withdrawn")}>
            Withdraw
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Show this story on your NomadNest profile. {story.owner_first_name} approves it and chooses any photos.
          </p>
          <Button className="rounded-full" disabled={requestPortfolio.isPending}
            onClick={() => run(requestPortfolio.mutateAsync(true), `Request sent to ${story.owner_first_name}`)}>
            Ask to show on my profile
          </Button>
        </div>
      )}
    </section>
  );
};

const SitStory = () => {
  const { id } = useParams<{ id: string }>();
  const { data: story, isLoading, refetch } = useSitStory(id);
  const { data: urls = {} } = useUpdatePhotoUrls(story?.photo_paths ?? []);
  const [reviewOpen, setReviewOpen] = useState(false);
  const paragraphs = useMemo(() => (story?.story ?? "").split(/\n{2,}/).filter(Boolean), [story?.story]);

  useEffect(() => {
    if (story?.title) document.title = `${story.title} | NomadNest`;
  }, [story?.title]);

  // The Pet Parent's view of a ready story (design: ParentSitStory.dc.html).
  if (story && story.role === "owner" && story.status === "ready") {
    return (
      <RoleTheme role="owner" className="flex min-h-screen flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-xl flex-1 px-5 pb-12 pt-20">
          <ParentStoryView story={story} urls={urls} paragraphs={paragraphs} onReviewed={() => refetch()} />
        </main>
        <Footer />
      </RoleTheme>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container max-w-2xl flex-1 px-4 pb-12 pt-20">
        <BackButton fallback="/dashboard" className="mb-4" />

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
        ) : !story ? (
          <div className="rounded-3xl border p-10 text-center text-muted-foreground">This story could not be found.</div>
        ) : story.status !== "ready" && !story.story ? (
          <div className="rounded-3xl border p-10 text-center">
            {story.status === "failed" ? (
              <p className="text-muted-foreground">We couldn't write this story. We'll try once more shortly.</p>
            ) : (
              <p className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Your Sit Story is being written…
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <article className="space-y-5 rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm sm:p-7">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <BookHeart className="h-4 w-4" aria-hidden="true" />
                Sit Story{story.city ? ` · ${story.city}` : ""}
              </p>
              <h1 className="font-display text-3xl font-bold leading-tight">{story.title}</h1>
              <p className="text-sm text-muted-foreground">
                {story.owner_first_name} and {story.sitter_first_name}
              </p>
              <div className="space-y-4 text-[17px] leading-relaxed">
                {story.story_days && story.story_days.length > 0
                  ? story.story_days.map((d, i) => (
                      <div key={d.date} className="space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
                          Day {i + 1} ·{" "}
                          {new Date(`${d.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                        </p>
                        <p>{d.text}</p>
                      </div>
                    ))
                  : paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              </div>
              {story.photo_paths.some((p) => urls[p]) && (
                <div className="grid grid-cols-2 gap-2">
                  {story.photo_paths.filter((p) => urls[p]).map((p) => (
                    <img key={p} src={urls[p]} alt={story.photo_alt?.[p] ?? ""} loading="lazy" className="aspect-square w-full rounded-2xl object-cover" />
                  ))}
                </div>
              )}
            </article>

            <PortfolioPanel story={story} urls={urls} />

            {story.can_review && story.sitter_user_id && (
              <section className="rounded-3xl border bg-card p-5 text-center shadow-sm">
                <p className="mb-3 text-sm text-muted-foreground">How did {story.sitter_first_name} do? Your review helps other Pet Parents.</p>
                <Button
                  size="lg"
                  className="h-auto w-full whitespace-normal rounded-full py-3 sm:w-auto"
                  onClick={() => setReviewOpen(true)}
                >
                  <Star className="mr-2 h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">Leave a review for {story.sitter_first_name}</span>
                </Button>
                <WriteReviewDialog
                  sitId={story.sit_id}
                  revieweeUserId={story.sitter_user_id}
                  revieweeName={story.sitter_first_name}
                  reviewType="sitter"
                  open={reviewOpen}
                  onOpenChange={setReviewOpen}
                  onReviewSubmitted={() => refetch()}
                />
              </section>
            )}
          </div>
        )}
      </main>
      <Footer />

    </div>
  );
};

export default SitStory;
