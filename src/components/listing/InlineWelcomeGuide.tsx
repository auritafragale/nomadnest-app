import { Link } from "react-router-dom";
import { BookOpen, KeyRound, Lock, MapPin } from "lucide-react";
import { useGuideCompletion } from "@/hooks/useWelcomeGuide";
import { daysUntil, formatUnlock, useMyGuideWindows } from "@/hooks/useSitterGuide";
import { guideNudge } from "@/lib/welcomeGuide";
import { nnButton } from "@/components/nn/ui";

/**
 * Welcome Guide card on the listing page (design: ListingPhone).
 * Owner: how complete the guide is, and what to add next. Confirmed Nomad:
 * when the arrival details unlock, and the exact address only while
 * get_listing_private_address allows it. Nothing for anyone else.
 */
const InlineWelcomeGuide = ({
  listingId,
  isOwner,
  addressPrivate,
  sitRange,
}: {
  listingId: string;
  isOwner: boolean;
  /** From get_listing_private_address: NULL outside the sitter's window. */
  addressPrivate?: string | null;
  /** The confirmed Nomad's dates, e.g. "12–25 Oct". */
  sitRange?: string | null;
}) => {
  const { data: completion } = useGuideCompletion(listingId, isOwner);
  const { data: windows = [] } = useMyGuideWindows();
  const guideWindow = !isOwner ? windows.find((w) => w.listing_id === listingId) : undefined;

  if (!isOwner && !guideWindow) return null;

  const percent = completion?.percent ?? null;
  const nudge = percent !== null && percent < 100 && completion?.nudge ? guideNudge(completion) : null;

  return (
    <section id="welcome-guide" aria-label="Welcome Guide" className="flex flex-col gap-3 rounded-[22px] border border-[var(--nn-border)] bg-[var(--nn-soft)] p-4 md:p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--nn-accent-dark)]">
        {isOwner ? "This is your listing" : sitRange ? `Your sit · ${sitRange}` : "Your sit"}
      </p>
      <h2 className="flex items-center gap-2 text-[18px] font-bold">
        <BookOpen className="h-5 w-5 text-[var(--nn-accent-dark)]" aria-hidden="true" />
        Welcome Guide
      </h2>

      {isOwner ? (
        percent !== null ? (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] font-semibold">{percent}% complete</p>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Welcome Guide progress">
              <div className="h-full rounded-full bg-[var(--nn-accent)]" style={{ width: `${percent}%` }} />
            </div>
            {nudge && <p className="text-[15px] text-muted-foreground">{nudge}</p>}
          </div>
        ) : (
          <p className="text-[15px] text-muted-foreground">Everything your Nomad needs, in one place.</p>
        )
      ) : (
        <div className="flex flex-col gap-2 text-[15px]">
          {addressPrivate && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--nn-accent-dark)]" aria-hidden="true" />
              <span className="whitespace-pre-line">{addressPrivate}</span>
            </p>
          )}
          {guideWindow &&
            (guideWindow.access_open ? (
              <p className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal-text" aria-hidden="true" />
                The address, keys and Wi-Fi are ready.
              </p>
            ) : (
              <p className="flex items-start gap-2 text-muted-foreground">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  The address, keys and Wi-Fi unlock on {formatUnlock(guideWindow.unlock_at, guideWindow.timezone)}, in{" "}
                  {daysUntil(guideWindow.unlock_at)} {daysUntil(guideWindow.unlock_at) === 1 ? "day" : "days"}.
                </span>
              </p>
            ))}
        </div>
      )}

      <Link to={`/listing/${listingId}/welcome-guide`} state={{ from: `/listing/${listingId}` }} className={nnButton("secondary", "self-start")}>
        Open Welcome Guide
      </Link>
    </section>
  );
};

export default InlineWelcomeGuide;
