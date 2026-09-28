import { Link } from "react-router-dom";
import { BookHeart, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMySitStories, type MySitStory, type PortfolioStatus } from "@/hooks/useSitStories";
import { useUpdatePhotoUrls } from "@/hooks/useDailyUpdates";
import { cn } from "@/lib/utils";

/** Portfolio status in words, from the viewer's side. */
const portfolioLabel = (story: MySitStory): { text: string; tone: "muted" | "primary" | "success" } => {
  const other = story.other_first_name;
  const status: PortfolioStatus = story.portfolio_status;
  if (story.role === "sitter") {
    switch (status) {
      case "requested":
        return { text: `Waiting for ${other}`, tone: "primary" };
      case "approved":
        return { text: "On your profile", tone: "success" };
      case "declined":
        return { text: `${other} kept it private`, tone: "muted" };
      case "revoked":
        return { text: `Removed by ${other}`, tone: "muted" };
      default:
        return { text: "Private · you can ask to add it to your profile", tone: "muted" };
    }
  }
  switch (status) {
    case "requested":
      return { text: `${other} asked to show it on their profile`, tone: "primary" };
    case "approved":
      return { text: `On ${other}'s profile`, tone: "success" };
    case "declined":
      return { text: "Kept private", tone: "muted" };
    case "revoked":
      return { text: `Removed from ${other}'s profile`, tone: "muted" };
    default:
      return { text: "Private", tone: "muted" };
  }
};

const toneClass = {
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

/**
 * Sit Stories for the role the member is looking at: Pet Parents see stories
 * of sits at their home, Nomads their own, each with its portfolio status.
 */
export const SitStoriesSection = ({ role }: { role: "owner" | "sitter" }) => {
  const { data: all = [] } = useMySitStories();
  const stories = all.filter((s) => s.role === role);
  const { data: urls = {} } = useUpdatePhotoUrls(stories.map((s) => s.photo_path).filter((p): p is string => !!p));

  if (stories.length === 0) return null;

  return (
    <section className="rounded-3xl border bg-card p-4 shadow-sm">
      <h2 className="flex items-center gap-2 px-1 font-display text-lg font-bold">
        <BookHeart className="h-5 w-5 text-primary" aria-hidden="true" />
        Sit Stories
      </h2>
      <ul className="mt-3 space-y-2">
        {stories.map((story) => {
          if (story.status !== "ready") {
            return (
              <li key={story.id} className="flex items-center gap-3 rounded-2xl border border-dashed p-3">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  The story of your sit {story.role === "sitter" ? "at" : "with"} {story.other_first_name}
                  {story.role === "sitter" && story.listing_title ? ` (${story.listing_title})` : ""} is being written.
                </p>
              </li>
            );
          }
          const status = portfolioLabel(story);
          const photo = story.photo_path ? urls[story.photo_path] : undefined;
          return (
            <li key={story.id}>
              <Link
                to={`/stories/${story.id}`}
                className="flex items-center gap-3 rounded-2xl border p-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {photo ? (
                    <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <BookHeart className="m-4 h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block truncate text-sm font-semibold">{story.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {story.role === "sitter" ? `With ${story.other_first_name}` : `${story.other_first_name} sat`}
                    {story.city ? ` · ${story.city}` : ""}
                  </span>
                  <Badge className={cn("max-w-full truncate border-0 text-[10px] font-medium", toneClass[status.tone])}>
                    {status.text}
                  </Badge>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
