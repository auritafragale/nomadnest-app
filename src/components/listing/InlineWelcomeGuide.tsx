import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BookOpen, KeyRound, Lock, MapPin } from "lucide-react";
import { useGuideCompletion } from "@/hooks/useWelcomeGuide";
import { daysUntil, formatUnlock, useMyGuideWindows } from "@/hooks/useSitterGuide";
import { GUIDE_COPY } from "@/lib/welcomeGuide";

/**
 * Compact Welcome Guide entry on the listing page.
 * Owner: progress + open the editor. Confirmed sitter: exact address (only
 * while get_listing_private_address allows it), the arrival-details status,
 * and a link to the full guide. Nothing for anyone else.
 */
const InlineWelcomeGuide = ({
  listingId,
  isOwner,
  addressPrivate,
}: {
  listingId: string;
  isOwner: boolean;
  /** From get_listing_private_address: NULL outside the sitter's window. */
  addressPrivate?: string | null;
}) => {
  const { data: completion } = useGuideCompletion(listingId, isOwner);
  const { data: windows = [] } = useMyGuideWindows();
  const guideWindow = !isOwner ? windows.find((w) => w.listing_id === listingId) : undefined;

  if (!isOwner && !guideWindow) return null;

  const openLink = (
    <Link to={`/listing/${listingId}/welcome-guide`} state={{ from: `/listing/${listingId}` }}>
      <Button className="w-full gap-2 sm:w-auto">
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        Open Welcome Guide
      </Button>
    </Link>
  );

  return (
    <section id="welcome-guide" className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
        Welcome Guide
      </h2>

      {isOwner ? (
        <p className="text-sm text-muted-foreground">
          {completion ? GUIDE_COPY.progress(completion.percent) : "Everything your sitter needs, in one place."}
        </p>
      ) : (
        <div className="space-y-3">
          {addressPrivate && (
            <p className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="whitespace-pre-line">{addressPrivate}</span>
            </p>
          )}
          {guideWindow && (
            <p className="flex items-start gap-2 text-sm">
              {guideWindow.access_open ? (
                <>
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  Arrival details ready
                </>
              ) : (
                <>
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>
                    Arrival details unlock in {daysUntil(guideWindow.unlock_at)} day
                    {daysUntil(guideWindow.unlock_at) === 1 ? "" : "s"} (
                    {formatUnlock(guideWindow.unlock_at, guideWindow.timezone)})
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      )}

      {openLink}
    </section>
  );
};

export default InlineWelcomeGuide;
