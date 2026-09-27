import { BookHeart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSitterPortfolio } from "@/hooks/useSitStories";
import { useUpdatePhotoUrls } from "@/hooks/useDailyUpdates";

/**
 * Sit Stories the Pet Parent approved for this sitter's profile: title,
 * excerpt and at most the 2 photos the Pet Parent chose. Members only.
 */
export const SitterPortfolio = ({ sitterId }: { sitterId: string }) => {
  const { data: stories = [] } = useSitterPortfolio(sitterId);
  const { data: urls = {} } = useUpdatePhotoUrls(stories.flatMap((s) => s.photo_paths));
  if (stories.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle asChild>
          <h2 className="flex items-center gap-2 text-lg">
            <BookHeart className="h-5 w-5 text-primary" aria-hidden="true" />
            Sit Stories
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {stories.map((story) => (
          <article key={story.id} className="space-y-2">
            {story.photo_paths.some((p) => urls[p]) && (
              <div className="grid grid-cols-2 gap-2">
                {story.photo_paths.filter((p) => urls[p]).map((p) => (
                  <img key={p} src={urls[p]} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
                ))}
              </div>
            )}
            <h3 className="font-display text-base font-bold">{story.title}</h3>
            {story.city && <p className="text-xs text-muted-foreground">{story.city}</p>}
            <p className="text-sm text-muted-foreground">
              {story.excerpt.length >= 220 ? `${story.excerpt.replace(/\s+\S*$/, "")}…` : story.excerpt}
            </p>
          </article>
        ))}
      </CardContent>
    </Card>
  );
};
