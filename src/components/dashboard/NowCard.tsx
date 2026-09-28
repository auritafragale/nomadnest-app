import { Link } from "react-router-dom";
import { differenceInCalendarDays, format, parseISO, startOfToday } from "date-fns";
import { CalendarDays, CheckCircle2, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CurrentSit, NextSit, SitRole } from "@/hooks/useDashboardSummary";

const formatDay = (iso: string) => format(parseISO(iso), "d MMM");

/**
 * The warm summary card: the sit happening now ("Day 3 of 7") or the next one
 * (a countdown), for the role the member is looking at.
 */
export const NowCard = ({
  role,
  current,
  next,
}: {
  role: SitRole;
  current: CurrentSit | null;
  next: NextSit | null;
}) => {
  if (current) {
    const isSitter = role === "sitter";
    const progress = Math.min(100, Math.round((current.day_number / Math.max(1, current.total_days)) * 100));
    const action = isSitter
      ? current.due_today && !current.sent_today
        ? "Send today's update"
        : "Open sit"
      : current.sent_today
        ? "See today's update"
        : "Open sit";
    return (
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {isSitter ? "Your sit now" : "Now at your home"}
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold">
          Day {current.day_number} of {current.total_days}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {isSitter
            ? `At ${current.other_first_name}'s · ${current.listing_title}`
            : `${current.other_first_name} is sitting · ${current.listing_title}`}
        </p>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="Sit progress"
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        {(current.sent_today || current.due_today) && (
          <p
            className={cn(
              "mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm",
              current.sent_today ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-background/80",
            )}
          >
            {current.sent_today ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <PawPrint className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            )}
            {current.sent_today
              ? "Today's update is sent"
              : isSitter
                ? "Today's update isn't sent yet"
                : `No update from ${current.other_first_name} yet today`}
          </p>
        )}
        <Button asChild className="mt-4 rounded-full" variant={isSitter && current.due_today && !current.sent_today ? "default" : "outline"}>
          <Link to={`/sits/${current.sit_id}`}>{action}</Link>
        </Button>
      </section>
    );
  }

  if (next) {
    const days = differenceInCalendarDays(parseISO(next.start_date), startOfToday());
    const countdown = days <= 0 ? "Starts today" : days === 1 ? "Starts tomorrow" : `Starts in ${days} days`;
    return (
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {role === "sitter" ? "Your next sit" : "Next sit at your home"}
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold">{countdown}</h2>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
          {formatDay(next.start_date)} to {formatDay(next.end_date)} ·{" "}
          {role === "sitter" ? `${next.listing_title}${next.city ? `, ${next.city}` : ""}` : `with ${next.other_first_name}`}
        </p>
        <Button asChild variant="outline" className="mt-4 rounded-full">
          <Link to={`/sits/${next.sit_id}`}>View sit</Link>
        </Button>
      </section>
    );
  }

  return null;
};
