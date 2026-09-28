import { useState } from "react";
import { Check, Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SitStory as SitStoryData } from "@/hooks/useSitStories";
import { defaultExcerpt, isValidShareCardPhotoCount, renderShareCard, shareOrDownload, type ShareCardSize } from "@/lib/shareCard";

/** Photo tiles that can be toggled on/off (share card, portfolio). */
export const PhotoPicker = ({
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

export const ShareCardMaker = ({
  story,
  urls,
  defaultSize = "feed",
}: {
  story: SitStoryData;
  urls: Record<string, string>;
  defaultSize?: ShareCardSize;
}) => {
  const [photos, setPhotos] = useState<string[]>(() => story.photo_paths.slice(0, story.photo_paths.length >= 2 ? 2 : 1));
  const photoCountOk = isValidShareCardPhotoCount(photos.length);
  const [excerpt, setExcerpt] = useState(() => defaultExcerpt(story.story ?? ""));
  const [size, setSize] = useState<ShareCardSize>(defaultSize);
  const [busy, setBusy] = useState(false);

  const make = async () => {
    if (!photoCountOk) {
      toast.info("Choose 1, 2 or 4 photos.");
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
        <p className="text-sm font-medium">Photos: choose 1, 2 or 4</p>
        <PhotoPicker paths={story.photo_paths} urls={urls} selected={photos} max={4} onChange={setPhotos} />
        {photos.length === 3 && (
          <p className="text-xs text-muted-foreground">Choose 1, 2 or 4 photos so the card lays out neatly.</p>
        )}
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
        <Button className="ml-auto rounded-full" onClick={make} disabled={busy || !photoCountOk}>
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
