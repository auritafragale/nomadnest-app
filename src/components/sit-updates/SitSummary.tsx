import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookHeart, BookOpen, CalendarClock, CheckCircle2, ChevronRight, MessageSquare, PawPrint, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionCard } from "@/components/nn/ui";
import { AskNestSheet } from "@/components/welcome-guide/AskNestSheet";
import { ArrivalCheckInRow } from "@/components/sits/ArrivalCheckInRow";
import { useStoryForSit } from "@/hooks/useSitStories";
import { useMyGuideWindows, daysUntil } from "@/hooks/useSitterGuide";
import { useAskNestAvailable } from "@/hooks/useAskNest";
import { useGuideCompletion } from "@/hooks/useWelcomeGuide";
import { resolveListingConversation } from "@/lib/conversations";
import { daysBetween, formatDay, updatePreferenceText } from "@/lib/dailyUpdate";
import type { SitUpdateContext } from "@/hooks/useDailyUpdates";
import { cn } from "@/lib/utils";

const petNames = (pets: SitUpdateContext["pets"]) => {
  const names = pets.map((p) => p.name).filter((n): n is string => !!n);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

const PetAvatars = ({ pets }: { pets: SitUpdateContext["pets"] }) => (
  <span className="flex shrink-0 -space-x-3">
    {pets.slice(0, 3).map((pet, i) => (
      <span
        key={`${pet.name}-${i}`}
        title={pet.name ?? undefined}
        className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-[#D8C3B0] text-sm font-bold text-[#5A4636]"
      >
        {pet.photo ? (
          <img src={pet.photo} alt={pet.name ?? "Pet"} className="h-full w-full object-cover" />
        ) : pet.name ? (
          pet.name.slice(0, 1).toUpperCase()
        ) : (
          <PawPrint className="h-5 w-5" aria-hidden="true" />
        )}
      </span>
    ))}
  </span>
);

/**
 * The sit at a glance: pets, "Day X of Y" (or before / finished / cancelled),
 * dates, progress, today's status and, for the Nomad, the update schedule.
 * Design: SitNomad / SitParent summary card.
 */
export const SitSummary = ({ context, sentToday }: { context: SitUpdateContext; sentToday: boolean }) => {
  const isSitter = context.role === "sitter";
  const inSit = context.day_number !== null;
  const cancelled = context.status === "cancelled";
  const beforeSit = !cancelled && context.today < context.start_date;
  const progress = inSit ? Math.min(100, Math.round((context.day_number! / context.total_days) * 100)) : beforeSit ? 0 : 100;
  const names = petNames(context.pets);
  const other = isSitter ? context.owner.first_name : context.sitter.first_name;
  const { data: story } = useStoryForSit(context.status === "completed" ? context.sit_id : undefined);
  // Only nudge on days an update is expected (the owner's update frequency).
  const dueToday = context.schedule ? context.schedule.due_today : !sentToday;

  const title = cancelled
    ? "Sit cancelled"
    : inSit
      ? `Day ${context.day_number} of ${context.total_days}`
      : beforeSit
        ? (() => {
            const n = daysBetween(context.today, context.start_date);
            return n === 1 ? "Starts tomorrow" : `Starts in ${n} days`;
          })()
        : "Sit finished";

  const status = cancelled
    ? { tone: "muted", text: "This sit was cancelled." }
    : context.other_member_left
      ? { tone: "muted", text: `${other} has left NomadNest. The updates stay here for you.` }
      : inSit && sentToday
        ? { tone: "ok", text: isSitter ? `Today's update is sent. ${other} can see it.` : `${other} shared today's update.` }
        : inSit && dueToday
          ? {
              tone: isSitter ? "warn" : "muted",
              text: isSitter ? `Today's update isn't sent yet. A photo and a few taps is all ${other} needs.` : `No update from ${other} yet today.`,
            }
          : null;

  return (
    <SectionCard label="Sit summary" className="flex flex-col gap-3.5 p-[18px] lg:p-5">
      <div className="flex items-center gap-3">
        {context.pets.length > 0 && <PetAvatars pets={context.pets} />}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-[13px] text-muted-foreground">
            {isSitter ? context.listing_title : `${context.sitter.first_name} is looking after ${names ?? "your pets"}`}
          </span>
          <h1 className="font-display text-[28px] font-normal leading-[1.1]">{title}</h1>
        </span>
      </div>
      <p className="text-[15px] text-muted-foreground">
        {formatDay(context.start_date)} to {formatDay(context.end_date)}
        {isSitter ? (names ? ` · with ${names}` : "") : ` · ${context.listing_title}`}
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[var(--nn-track)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Sit progress"
      >
        <div className="h-full rounded-full bg-[var(--nn-accent)]" style={{ width: `${progress}%` }} />
      </div>
      {status && (
        <p
          className={cn(
            "flex items-start gap-2.5 rounded-[14px] px-3.5 py-3 text-[15px] leading-snug",
            status.tone === "ok" && "bg-[var(--nn-ok-bg)] text-foreground",
            status.tone === "warn" && "bg-[var(--nn-tint)] text-foreground",
            status.tone === "muted" && "bg-muted text-foreground",
          )}
        >
          {status.tone === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--nn-ok-text)]" aria-hidden="true" />
          ) : (
            <PawPrint className="mt-0.5 h-4 w-4 shrink-0 text-[var(--nn-accent-dark)]" aria-hidden="true" />
          )}
          {status.text}
        </p>
      )}
      {isSitter && context.schedule && !context.other_member_left && !cancelled && (inSit || beforeSit) && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {updatePreferenceText(other, context.schedule)}
        </p>
      )}
      {story?.status === "ready" && (
        <Link
          to={`/stories/${story.id}`}
          className="flex min-h-[44px] items-center justify-between gap-2 rounded-[14px] bg-[var(--nn-soft)] px-3.5 text-[15px] font-bold"
        >
          <span className="flex items-center gap-2">
            <BookHeart className="h-4 w-4 text-[var(--nn-accent-dark)]" aria-hidden="true" />
            Read the Sit Story
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
    </SectionCard>
  );
};

interface Action {
  key: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  to?: string;
  onClick?: () => void;
  tone: "accent" | "ok" | "neutral";
}

const iconTone = (tone: Action["tone"]) =>
  tone === "ok"
    ? "bg-[var(--nn-ok-bg)] text-[var(--nn-ok-text)]"
    : tone === "accent"
      ? "bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]"
      : "bg-[var(--nn-chip)] text-muted-foreground";

/**
 * Welcome Guide (arrival status for the Nomad, completion for the Pet Parent),
 * Ask the Nest (Nomad, when enabled and the guide is open), Message, and the
 * Arrival Check-In row (Nomad). Tiles on phone, a list beside the updates on
 * tablet and desktop.
 */
export const SitActions = ({ context }: { context: SitUpdateContext }) => {
  const navigate = useNavigate();
  const isSitter = context.role === "sitter";
  const other = isSitter ? context.owner.first_name : context.sitter.first_name;
  const { data: windows = [] } = useMyGuideWindows();
  const guideWindow = isSitter ? windows.find((w) => w.sit_id === context.sit_id) : undefined;
  const askNestAvailable = useAskNestAvailable();
  const { data: completion } = useGuideCompletion(!isSitter ? context.listing_id : undefined);
  const [askOpen, setAskOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const cancelled = context.status === "cancelled";

  const openChat = async () => {
    if (opening || !context.owner_user_id || !context.sitter_user_id) return;
    setOpening(true);
    try {
      const id = await resolveListingConversation({
        listingId: context.listing_id,
        ownerUserId: context.owner_user_id,
        sitterUserId: context.sitter_user_id,
      });
      navigate(id ? `/inbox?conversation=${id}` : "/inbox");
    } catch {
      navigate("/inbox");
    } finally {
      setOpening(false);
    }
  };

  const actions: Action[] = [];
  if (context.listing_id) {
    actions.push({
      key: "guide",
      icon: BookOpen,
      title: "Welcome Guide",
      detail: isSitter
        ? guideWindow
          ? guideWindow.access_open
            ? "Arrival details ready"
            : `Unlocks in ${daysUntil(guideWindow.unlock_at)} ${daysUntil(guideWindow.unlock_at) === 1 ? "day" : "days"}`
          : "Read the guide"
        : completion
          ? `${completion.percent}% complete`
          : "Your guide for Nomads",
      to: `/listing/${context.listing_id}/welcome-guide`,
      tone: isSitter && guideWindow?.access_open ? "ok" : "neutral",
    });
  }
  if (isSitter && guideWindow && askNestAvailable && !cancelled) {
    actions.push({
      key: "ask",
      icon: Sparkles,
      title: "Ask the Nest",
      detail: `Answers from ${other}'s guide`,
      onClick: () => setAskOpen(true),
      tone: "accent",
    });
  }
  if (!context.other_member_left && context.owner_user_id && context.sitter_user_id) {
    actions.push({ key: "message", icon: MessageSquare, title: `Message ${other}`, detail: "Opens your chat", onClick: openChat, tone: "neutral" });
  }

  const tile = (a: Action) => {
    const body = (
      <>
        <span className={cn("flex h-[34px] w-[34px] items-center justify-center rounded-full", iconTone(a.tone))}>
          <a.icon className="h-[17px] w-[17px]" aria-hidden="true" />
        </span>
        <span className="text-[13px] font-bold">{a.key === "message" ? "Message" : a.title}</span>
        <span className="text-[11px] text-muted-foreground">{a.key === "message" ? `Chat with ${other}` : a.detail}</span>
      </>
    );
    const cls = "flex min-h-[44px] flex-col gap-1.5 rounded-2xl bg-[var(--nn-soft)] px-2.5 py-3 text-left";
    return a.to ? (
      <Link key={a.key} to={a.to} className={cls}>
        {body}
      </Link>
    ) : (
      <button key={a.key} type="button" onClick={a.onClick} className={cls}>
        {body}
      </button>
    );
  };

  const row = (a: Action, first: boolean) => {
    const body = (
      <>
        <span className={cn("flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full", iconTone(a.tone))}>
          <a.icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">{a.title}</span>
          <span className="text-xs text-muted-foreground">{a.detail}</span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
      </>
    );
    const cls = cn("flex min-h-[56px] w-full items-center gap-3 py-3 text-left", !first && "border-t border-[var(--nn-line)]");
    return a.to ? (
      <Link key={a.key} to={a.to} className={cls}>
        {body}
      </Link>
    ) : (
      <button key={a.key} type="button" onClick={a.onClick} className={cls}>
        {body}
      </button>
    );
  };

  return (
    <>
      {/* Phone: tiles, then Arrival Check-In. */}
      {actions.length > 0 && (
        <div className={cn("grid gap-2 md:hidden", actions.length === 3 ? "grid-cols-3" : actions.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {actions.map(tile)}
        </div>
      )}
      {isSitter && !cancelled && <ArrivalCheckInRow sitId={context.sit_id} startDate={context.start_date} className="md:hidden" />}

      {/* Tablet and desktop: one list. */}
      <SectionCard label="Sit actions" className="hidden px-[18px] py-1.5 md:block">
        {isSitter && !cancelled && (
          <ArrivalCheckInRow sitId={context.sit_id} startDate={context.start_date} className="my-2 border-0 bg-transparent px-0" />
        )}
        {actions.map((a, i) => row(a, i === 0))}
      </SectionCard>

      {guideWindow && askNestAvailable && context.listing_id && (
        <AskNestSheet listingId={context.listing_id} open={askOpen} onOpenChange={setAskOpen} />
      )}
    </>
  );
};
