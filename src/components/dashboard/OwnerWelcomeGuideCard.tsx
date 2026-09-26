import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, ChevronRight, CheckCircle2 } from "lucide-react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { useOwnerListings } from "@/hooks/useOwnerListings";
import { useGuideCompletion } from "@/hooks/useWelcomeGuide";

const ListingGuideRow = ({ id, title }: { id: string; title: string }) => {
  const { data: completion, isLoading } = useGuideCompletion(id);
  const percent = completion?.percent ?? 0;
  return (
    <li>
      <Link
        to={`/listing/${id}/welcome-guide`}
        className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-sm font-medium">{title}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
        {percent >= 100 ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Guide complete" />
        ) : (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {isLoading ? "…" : `${percent}%`}
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
};

/** The Pet Parent's Welcome Guides: one per listing, each with its progress. */
const OwnerWelcomeGuideCard = () => {
  const { data: listings = [], isLoading } = useOwnerListings();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <BookOpen className="w-5 h-5 text-primary" />
            Welcome Guides
            <HelpTooltip
              label="About the Welcome Guide"
              content="Each home has its own guide. Complete guides mean fewer questions while you're away and a smoother handover."
            />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : listings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a listing to start its Welcome Guide.</p>
        ) : (
          <ul className="space-y-2">
            {listings.map((l) => (
              <ListingGuideRow key={l.id} id={l.id} title={l.title} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default OwnerWelcomeGuideCard;
