import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen, CheckCircle2, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { daysBetween, formatDay } from "@/lib/dailyUpdate";
import type { SitUpdateContext } from "@/hooks/useDailyUpdates";

const PetAvatars = ({ pets }: { pets: SitUpdateContext["pets"] }) => (
  <div className="flex -space-x-2">
    {pets.slice(0, 4).map((pet, i) => (
      <div
        key={`${pet.name}-${i}`}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-primary/10 text-xs font-semibold text-primary"
        title={pet.name ?? undefined}
      >
        {pet.photo ? (
          <img src={pet.photo} alt={pet.name ?? "Pet"} className="h-full w-full object-cover" />
        ) : pet.name ? (
          pet.name.slice(0, 1).toUpperCase()
        ) : (
          <PawPrint className="h-4 w-4" aria-hidden="true" />
        )}
      </div>
    ))}
  </div>
);

const petNames = (pets: SitUpdateContext["pets"]) => {
  const names = pets.map((p) => p.name).filter((n): n is string => !!n);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

/** "Day 3 of 7" with the pets, progress and a gentle nudge for today's update. */
export const SitProgressHeader = ({ context, sentToday }: { context: SitUpdateContext; sentToday: boolean }) => {
  const isSitter = context.role === "sitter";
  const inSit = context.day_number !== null;
  const beforeSit = context.today < context.start_date;
  const progress = inSit ? Math.min(100, Math.round((context.day_number! / context.total_days) * 100)) : beforeSit ? 0 : 100;
  const names = petNames(context.pets);
  const other = isSitter ? context.owner.first_name : context.sitter.first_name;

  const title = inSit
    ? `Day ${context.day_number} of ${context.total_days}`
    : beforeSit
      ? (() => {
          const n = daysBetween(context.today, context.start_date);
          return n === 1 ? "Starts tomorrow" : `Starts in ${n} days`;
        })()
      : "Sit finished";

  return (
    <header className="space-y-4">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Dashboard
      </Link>

      <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{context.listing_title}</p>
            <h1 className="mt-1 font-display text-2xl font-bold">{title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDay(context.start_date)} to {formatDay(context.end_date)}
              {names ? ` · with ${names}` : ""}
            </p>
          </div>
          {context.pets.length > 0 && <PetAvatars pets={context.pets} />}
        </div>

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

        {inSit && (
          <p
            className={cn(
              "mt-4 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm",
              sentToday ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-background/80 text-foreground",
            )}
          >
            {sentToday ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {isSitter ? `Today's update is sent. ${other} can see it.` : `${other} shared today's update.`}
              </>
            ) : isSitter ? (
              <>
                <PawPrint className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Today's update isn't sent yet. A photo and a few taps is all {other} needs.
              </>
            ) : (
              <>
                <PawPrint className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                No update from {other} yet today.
              </>
            )}
          </p>
        )}

        {context.listing_id && (
          <Button asChild variant="secondary" size="sm" className="mt-4 rounded-full">
            <Link to={`/listing/${context.listing_id}/welcome-guide`}>
              <BookOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Welcome Guide
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
};
