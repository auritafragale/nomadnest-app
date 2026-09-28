import { useState } from "react";
import { BookHeart, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useSitterPortfolio, usePortfolioStory, type PortfolioStory } from "@/hooks/useSitStories";
import { usePortfolioPhotoUrls } from "@/hooks/useDailyUpdates";
import logo from "@/assets/Black_Logo.png";

/** Branded stand-in when a story has no approved photos. */
const PlaceholderImage = ({ className }: { className?: string }) => (
  <div
    className={`flex items-center justify-center bg-gradient-to-br from-[#FAF7F2] via-[#FBE9E2] to-[#F6C9B9] ${className ?? ""}`}
    aria-hidden="true"
  >
    <img src={logo} alt="" className="w-1/3 max-w-[96px] opacity-80" />
  </div>
);

const StoryCard = ({
  story,
  urls,
  onOpen,
}: {
  story: PortfolioStory;
  urls: Record<string, string>;
  onOpen: () => void;
}) => {
  const photos = story.photo_paths.filter((p) => urls[p]);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-64 shrink-0 snap-start overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {photos.length === 0 ? (
        <PlaceholderImage className="aspect-[4/3] w-full" />
      ) : (
        <div className={`grid aspect-[4/3] w-full gap-0.5 ${photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {photos.map((p) => (
            <img key={p} src={urls[p]} alt="" loading="lazy" className="h-full w-full object-cover" />
          ))}
        </div>
      )}
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 font-display text-sm font-bold">{story.title}</h3>
        {story.city && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {story.city}
          </p>
        )}
        <p className="line-clamp-3 text-xs text-muted-foreground">{story.excerpt}</p>
      </div>
    </button>
  );
};

/** The full approved story, read-only (title, text, approved photos). */
const StoryDialog = ({ storyId, onClose }: { storyId: string | null; onClose: () => void }) => {
  const { data: story, isLoading } = usePortfolioStory(storyId);
  const { data: urls = {} } = usePortfolioPhotoUrls(story?.photo_paths ?? []);
  const photos = (story?.photo_paths ?? []).filter((p) => urls[p]);
  const paragraphs = (story?.story ?? "").split(/\n{2,}/).filter(Boolean);

  return (
    <Dialog open={!!storyId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-3xl">
        {isLoading ? (
          <div className="space-y-3">
            <DialogTitle className="sr-only">Sit Story</DialogTitle>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !story ? (
          <>
            <DialogTitle>Sit Story</DialogTitle>
            <DialogDescription>This story isn't available.</DialogDescription>
          </>
        ) : (
          <article className="space-y-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <BookHeart className="h-4 w-4" aria-hidden="true" />
              Sit Story{story.city ? ` · ${story.city}` : ""}
            </p>
            <DialogTitle className="font-display text-2xl font-bold leading-tight">{story.title}</DialogTitle>
            <DialogDescription className="sr-only">A Sit Story approved by the Pet Parent.</DialogDescription>
            {photos.length > 0 && (
              <div className={`grid gap-2 ${photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {photos.map((p) => (
                  <img key={p} src={urls[p]} alt="" className="aspect-square w-full rounded-2xl object-cover" />
                ))}
              </div>
            )}
            <div className="space-y-3 text-[15px] leading-relaxed">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </article>
        )}
      </DialogContent>
    </Dialog>
  );
};

/**
 * Sit Stories the Pet Parent approved for this Nomad's profile, as a
 * horizontal row. Members only; photos are the owner-approved ones, on
 * short-lived links.
 */
export const SitterPortfolio = ({ sitterId }: { sitterId: string }) => {
  const { data: stories = [] } = useSitterPortfolio(sitterId);
  const { data: urls = {} } = usePortfolioPhotoUrls(stories.flatMap((s) => s.photo_paths));
  const [openId, setOpenId] = useState<string | null>(null);
  if (stories.length === 0) return null;

  return (
    <section className="mb-6" aria-labelledby="sit-stories-heading">
      <h2 id="sit-stories-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <BookHeart className="h-5 w-5 text-primary" aria-hidden="true" />
        Sit Stories · {stories.length}
      </h2>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {stories.map((story) => (
          <StoryCard key={story.id} story={story} urls={urls} onOpen={() => setOpenId(story.id)} />
        ))}
      </div>
      <StoryDialog storyId={openId} onClose={() => setOpenId(null)} />
    </section>
  );
};
