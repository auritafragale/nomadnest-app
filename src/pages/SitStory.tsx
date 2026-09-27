import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookHeart, Check, Download, Loader2, RefreshCw, Share2, Star, UserRound } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import WriteReviewDialog from "@/components/reviews/WriteReviewDialog";
import { cn } from "@/lib/utils";
import { useSitStory, useSitStoryActions, type SitStory as SitStoryData } from "@/hooks/useSitStories";
import { useUpdatePhotoUrls } from "@/hooks/useDailyUpdates";
import { defaultExcerpt, renderShareCard, shareOrDownload, type ShareCardSize } from "@/lib/shareCard";

/** Photo tiles that can be toggled on/off (share card, portfolio). */
const PhotoPicker = ({
  paths,
  urls,
  selected,
  max,
  onChange,
}: {
  paths: string[];
  urls: Record<string, string>;
  selected: string[];
  max: number;
  onChange: (next: string[]) => void;
}) => (
  <div className="grid grid-cols-3 gap-2">
    {paths.filter((p) => urls[p]).map((p, i) => {
      const on = selected.includes(p);
      return (
        <button
          key={p}
          type="button"
          aria-pressed={on}
          aria-label={`Photo ${i + 1}${on ? ", selected" : ""}`}
          onClick={() => {
            if (on) onChange(selected.filter((x) => x !== p));
            else if (selected.length < max) onChange([...selected, p]);
            else toast.info(`Choose up to ${max} photo${max === 1 ? "" : "s"}.`);
          }}
          className={cn(
            "relative aspect-square overflow-hidden rounded-xl border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            on ? "border-primary" : "border-transparent opacity-80 hover:opacity-100",
          )}
        >
          <img src={urls[p]} alt="" className="h-full w-full object-cover" />
          {on && (
            <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-4 w-4" />
            </span>
          )}
        </button>
      );
    })}
  </div>
);

const ShareCardMaker = ({ story, urls }: { story: SitStoryData; urls: Record<string, string> }) => {
  const [photos, setPhotos] = useState<string[]>(() => story.photo_paths.slice(0, 2));
  const [excerpt, setExcerpt] = useState(() => defaultExcerpt(story.story ?? ""));
  const [size, setSize] = useState<ShareCardSize>("feed");
  const [busy, setBusy] = useState(false);

  const make = async () => {
    if (photos.length === 0) {
      toast.info("Choose at least one photo.");
      return;
    }
    setBusy(true);
    try {
      const blob = await renderShareCard({
        size,
        title: story.title ?? "Our Sit Story",
        excerpt: excerpt.trim() || defaultExcerpt(story.story ?? ""),
        photoUrls: photos.map((p) => urls[p]).filter(Boolean),
        city: story.city,
        sitterName: story.sitter_share_name,
      });
      const result = await shareOrDownload(blob, `nomadnest-sit-story-${size}.jpg`, story.title ?? "Sit Story");
      if (result === "downloaded") toast.success("Image saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The image couldn't be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-3xl border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="share-heading">
      <div>
        <h2 id="share-heading" className="flex items-center gap-2 font-display text-lg font-bold">
          <Share2 className="h-5 w-5 text-primary" aria-hidden="true" />
          Share your Sit Story
        </h2>
        <p className="text-sm text-muted-foreground">
          We make the image on your phone. Nothing is posted anywhere until you share it.
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Photos (up to 4)</p>
        <PhotoPicker paths={story.photo_paths} urls={urls} selected={photos} max={4} onChange={setPhotos} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="share-excerpt" className="text-sm font-medium">Words on the card</label>
        <Textarea
          id="share-excerpt"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value.slice(0, 200))}
          rows={3}
          className="rounded-2xl text-base sm:text-sm"
        />
        <p className="text-xs text-muted-foreground">Only used on the card; your story stays the same.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border p-1" role="group" aria-label="Image size">
          {(["feed", "story"] as ShareCardSize[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={size === s}
              onClick={() => setSize(s)}
              className={cn("rounded-full px-3 py-1 text-xs font-medium", size === s ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {s === "feed" ? "Feed (4:5)" : "Story (9:16)"}
            </button>
          ))}
        </div>
        <Button className="ml-auto rounded-full" onClick={make} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {busy ? "Making your image…" : "Create share image"}
        </Button>
      </div>
      {!story.sitter_share_name && (
        <p className="text-xs text-muted-foreground">The card says "our NomadNest sitter": your sitter prefers their name not to be shared.</p>
      )}
    </section>
  );
};

const PortfolioPanel = ({ story, urls }: { story: SitStoryData; urls: Record<string, string> }) => {
  const { requestPortfolio, decidePortfolio } = useSitStoryActions(story.id);
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
        status === "requested" || status === "approved" ? (
          <>
            <p className="text-sm text-muted-foreground">
              {status === "requested"
                ? `${story.sitter_first_name} would like to show this story on their profile. Choose up to 2 photos to show with it, or none.`
                : "This story is on their profile with the photos below. You can change the photos or remove it at any time."}
            </p>
            <PhotoPicker paths={story.photo_paths} urls={urls} selected={picked} max={2} onChange={setPicked} />
            <div className="flex flex-wrap gap-2">
              <Button
                className="rounded-full"
                disabled={decidePortfolio.isPending}
                onClick={() => run(decidePortfolio.mutateAsync({ decision: "approve", photoPaths: picked }), status === "requested" ? "Approved" : "Saved")}
              >
                {status === "requested" ? "Approve" : "Save photos"}
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                disabled={decidePortfolio.isPending}
                onClick={() => run(decidePortfolio.mutateAsync({ decision: status === "requested" ? "decline" : "revoke" }), status === "requested" ? "Declined" : "Removed from their profile")}
              >
                {status === "requested" ? "Decline" : "Remove from their profile"}
              </Button>
            </div>
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
  const { rewrite } = useSitStoryActions(id);
  const { data: urls = {} } = useUpdatePhotoUrls(story?.photo_paths ?? []);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const paragraphs = useMemo(() => (story?.story ?? "").split(/\n{2,}/).filter(Boolean), [story?.story]);

  useEffect(() => {
    if (story?.title) document.title = `${story.title} | NomadNest`;
  }, [story?.title]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container max-w-2xl flex-1 px-4 pb-12 pt-20">
        <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>

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
              {story.rewriting && (
                <p className="flex items-center gap-2 rounded-2xl bg-background/80 px-3 py-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Writing it again…
                </p>
              )}
              <div className="space-y-4 text-[17px] leading-relaxed">
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              {story.photo_paths.some((p) => urls[p]) && (
                <div className="grid grid-cols-2 gap-2">
                  {story.photo_paths.filter((p) => urls[p]).map((p) => (
                    <img key={p} src={urls[p]} alt="" loading="lazy" className="aspect-square w-full rounded-2xl object-cover" />
                  ))}
                </div>
              )}
              {story.can_rewrite && (
                <Button variant="ghost" size="sm" className="gap-1.5 rounded-full" onClick={() => setConfirmRewrite(true)}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Write it again
                </Button>
              )}
            </article>

            {story.role === "owner" && story.status === "ready" && story.photo_paths.length > 0 && (
              <ShareCardMaker story={story} urls={urls} />
            )}

            <PortfolioPanel story={story} urls={urls} />

            {story.can_review && story.sitter_user_id && (
              <section className="rounded-3xl border bg-card p-5 text-center shadow-sm">
                <p className="mb-3 text-sm text-muted-foreground">How did {story.sitter_first_name} do? Your review helps other Pet Parents.</p>
                <Button size="lg" className="rounded-full" onClick={() => setReviewOpen(true)}>
                  <Star className="mr-2 h-5 w-5" aria-hidden="true" />
                  Leave a review for {story.sitter_first_name}
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

      <AlertDialog open={confirmRewrite} onOpenChange={setConfirmRewrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Write it again?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll write a new title and story from the same updates and photos. You can do this once, and the current
              story stays until the new one is ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                rewrite.mutate(undefined, {
                  onSuccess: () => toast.success("Writing it again"),
                  onError: (err) => toast.error(err.message || "That didn't work. Please try again."),
                })
              }
            >
              Write it again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SitStory;
