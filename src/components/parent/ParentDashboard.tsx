import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, parseISO, startOfToday } from "date-fns";
import { BookHeart, BookOpen, CalendarPlus, Camera, ChevronRight, MessageSquare, Plus, Star, User, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, SerifTitle, StatusChip, nnButton, shortRange, type ChipTone } from "@/components/nn/ui";
import { TodoList, type TodoItem } from "@/components/dashboard/TodoList";
import { OwnerListingCard } from "@/components/dashboard/OwnerListingCard";
import { UpcomingPastSits } from "@/components/dashboard/UpcomingPastSits";
import { useOwnerListings } from "@/hooks/useOwnerListings";
import { useListingAllowance } from "@/hooks/useListingAllowance";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useGuideCompletion } from "@/hooks/useWelcomeGuide";
import { useMySitStories, useStoryForSit } from "@/hooks/useSitStories";
import { useUpdatePhotoUrls } from "@/hooks/useDailyUpdates";
import { useSits, type Sit } from "@/hooks/useSits";
import type { CurrentSit, DashboardSummary, NextSit } from "@/hooks/useDashboardSummary";
import type { Completion } from "@/lib/profileCompletion";
import { DashboardColumns } from "@/components/dashboard/DashboardColumns";
import { cn } from "@/lib/utils";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The sit at your home now ("Day 3 of 7"), or the next one's countdown. */
const HomeSitCard = ({ current, next, className }: { current: CurrentSit | null; next: NextSit | null; className?: string }) => {
  if (!current && !next) return null;
  const s = current ?? next!;
  const days = next && !current ? differenceInCalendarDays(parseISO(next.start_date), startOfToday()) : 0;
  return (
    <SectionCard label={current ? "Now at your home" : "Next sit at your home"} className={cn("flex flex-col gap-3 p-[18px]", className)}>
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#656B74]">
        {current ? "Now at your home" : "Next sit at your home"}
      </span>
      <h2 className="font-display text-[25px] leading-[1.1]">
        {current
          ? `Day ${current.day_number} of ${current.total_days}`
          : days <= 0
            ? "Starts today"
            : days === 1
              ? "Starts tomorrow"
              : `Starts in ${days} days`}
      </h2>
      <p className="text-sm text-[#656B74]">
        {s.other_first_name} is {current ? "sitting" : "sitting for you"} · {shortRange(s.start_date, s.end_date)}
      </p>
      {current && (
        <div
          role="progressbar"
          aria-label="Sit progress"
          aria-valuenow={current.day_number}
          aria-valuemin={0}
          aria-valuemax={current.total_days}
          className="h-1.5 rounded-full bg-[#EDEFF2]"
        >
          <div
            className="h-1.5 rounded-full bg-[var(--nn-accent)]"
            style={{ width: `${Math.min(100, Math.round((current.day_number / Math.max(1, current.total_days)) * 100))}%` }}
          />
        </div>
      )}
      {current && (current.sent_today || current.due_today) && (
        <p
          className={`flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 text-sm ${
            current.sent_today ? "bg-[#E1F2EC] text-brand-teal-text" : "bg-[#F6F3F1] text-[#3F444B]"
          }`}
        >
          <Camera className="h-5 w-5 shrink-0" aria-hidden="true" />
          {current.sent_today ? `${current.other_first_name} sent today's update.` : `No update from ${current.other_first_name} yet today.`}
        </p>
      )}
      <Link to={`/sits/${s.sit_id}`} className={nnButton(current?.sent_today ? "primary" : "secondary", "h-[52px] rounded-2xl text-[15px]")}>
        {current ? (current.sent_today ? "See today's update" : "Open the sit") : "View sit"}
      </Link>
    </SectionCard>
  );
};

const sitChip = (sit: Sit): { label: string; tone: ChipTone } => {
  const today = new Date().toISOString().slice(0, 10);
  const end = sit.sit_dates?.end_date;
  const start = sit.sit_dates?.start_date;
  if (sit.status === "cancelled") return { label: "Cancelled", tone: "grey" };
  if (sit.status === "completed" || (end && end < today)) return { label: "Completed", tone: "grey" };
  if (start && start <= today) return { label: "Now", tone: "green" };
  return { label: "Upcoming", tone: "accent" };
};

const SitRow = ({ sit }: { sit: Sit }) => {
  const chip = sitChip(sit);
  const finished = chip.label === "Completed";
  const { data: story } = useStoryForSit(finished ? sit.id : undefined);
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--nn-line)] pt-3 first:border-t-0 first:pt-1">
      <Link to={`/sits/${sit.id}`} className="flex items-center gap-3">
        <span className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] bg-[#BFA98F]">
          {sit.listing?.photos?.[0] && <img src={sit.listing.photos[0]} alt="" className="h-full w-full object-cover" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-bold">{sit.listing?.title ?? "Your home"}</span>
          <span className="truncate text-[13px] text-[#656B74]">
            {[sit.sitter_profile?.first_name, sit.sit_dates && shortRange(sit.sit_dates.start_date, sit.sit_dates.end_date)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
      </Link>
      {story?.status === "ready" && (
        <Link
          to={`/stories/${story.id}`}
          className="flex h-11 items-center justify-between rounded-[14px] bg-[var(--nn-soft)] px-3.5 text-sm font-bold"
        >
          <span className="flex items-center gap-2">
            <BookHeart className="h-4 w-4 text-[var(--nn-accent-dark)]" aria-hidden="true" />
            Read the Sit Story
          </span>
          <ChevronRight className="h-4 w-4 text-[#9097A1]" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
};

/** "Sits": the latest three, and See all for every sit with its actions. */
const SitsSection = ({
  openReview,
  onReviewAutoOpened,
  className,
}: {
  openReview?: string | null;
  onReviewAutoOpened?: (id: string) => void;
  className?: string;
}) => {
  const { data: sits = [] } = useSits();
  const [showAll, setShowAll] = useState(!!openReview);
  const mine = sits
    .filter((s) => s.status !== "cancelled" || s.cancelled_from_status === "in_progress")
    .sort((a, b) => (b.sit_dates?.start_date ?? "").localeCompare(a.sit_dates?.start_date ?? ""));
  if (mine.length === 0 && !showAll) return null;
  return (
    <SectionCard label="Sits" className={cn("flex min-w-0 flex-col gap-2.5 p-[18px]", className)}>
      <div className="flex items-baseline justify-between">
        <SerifTitle>Sits</SerifTitle>
        <button type="button" onClick={() => setShowAll((v) => !v)} className="min-h-[44px] text-sm font-bold text-[var(--nn-accent-dark)]">
          {showAll ? "Show less" : "See all"}
        </button>
      </div>
      {showAll ? (
        <div id="your-sits" className="scroll-mt-24">
          <UpcomingPastSits viewAs="owner" openReview={openReview} onAutoOpened={onReviewAutoOpened} />
        </div>
      ) : (
        mine.slice(0, 3).map((s) => <SitRow key={s.id} sit={s} />)
      )}
    </SectionCard>
  );
};

/**
 * "Sit Stories": a sideways row of story cards with their profile status.
 * Desktop: a card with one row per story (ParentDesktop.dc.html).
 */
const StoriesRow = ({ className }: { className?: string }) => {
  const { data: all = [] } = useMySitStories();
  const stories = all.filter((s) => s.role === "owner" && s.status === "ready");
  const { data: urls = {} } = useUpdatePhotoUrls(stories.map((s) => s.photo_path).filter((p): p is string => !!p));
  const status = (p: string, other: string): { label: string; tone: ChipTone } =>
    p === "approved"
      ? { label: `On ${other}'s profile`, tone: "green" }
      : p === "requested"
        ? { label: `${other} asked to show it`, tone: "accent" }
        : { label: "Private", tone: "grey" };
  return (
    <section
      aria-label="Sit Stories"
      className={cn(
        "flex min-w-0 flex-col gap-3 lg:rounded-[24px] lg:border lg:border-[var(--nn-border)] lg:bg-white lg:p-[18px]",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <SerifTitle>Sit Stories</SerifTitle>
        {stories.length > 0 && (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--nn-accent)] px-1.5 text-xs font-bold text-white">
            {stories.length}
          </span>
        )}
      </div>
      <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0 lg:flex-col lg:overflow-visible lg:pb-0">
        {stories.map((s) => {
          const st = status(s.portfolio_status, s.other_first_name);
          const photo = s.photo_path ? urls[s.photo_path] : undefined;
          return (
            <Link
              key={s.id}
              to={`/stories/${s.id}`}
              className="flex w-[250px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border border-[var(--nn-border)] bg-white lg:w-full lg:flex-row lg:items-center lg:gap-3 lg:rounded-none lg:border-0"
            >
              <span className="h-[150px] bg-[#D6B98F] lg:h-[72px] lg:w-[88px] lg:shrink-0 lg:overflow-hidden lg:rounded-[14px]">
                {photo && <img src={photo} alt="" className="h-full w-full object-cover" />}
              </span>
              <span className="flex min-w-0 flex-col gap-2 p-3.5 lg:gap-1 lg:p-0">
                <span className="font-display text-xl leading-[1.15] lg:text-lg">{s.title}</span>
                {s.city && <span className="text-[13px] text-[#656B74]">{s.city}</span>}
                <span className="self-start">
                  <StatusChip tone={st.tone}>{st.label}</StatusChip>
                </span>
              </span>
            </Link>
          );
        })}
        <span className="flex w-[190px] shrink-0 flex-col justify-center gap-2 rounded-[22px] border-[1.5px] border-dashed border-[#BFDCD4] bg-white p-[18px] text-sm leading-snug text-[#656B74] lg:w-full lg:p-3.5">
          {stories.length === 0 ? "Your first Sit Story appears after your first sit." : "Your next Sit Story appears after your next sit."}
        </span>
      </div>
    </section>
  );
};

/** Welcome Guide to-do for the member's most recent listing. */
const useGuideTodo = (listingId: string | undefined): TodoItem | null => {
  const { data } = useGuideCompletion(listingId);
  if (!listingId || !data || data.percent >= 100) return null;
  return {
    key: "guide",
    icon: BookOpen,
    label: "Finish your Welcome Guide",
    detail: `${data.percent}% done`,
    urgent: true,
    to: `/listing/${listingId}/welcome-guide`,
  };
};

/**
 * The Pet Parent side of the dashboard. Phone: PetParent.dc.html. Tablet: the
 * Nomad tablet pattern (the sit and your home wide, then To do beside Sits).
 * Desktop: ParentDesktop.dc.html, with To do in the profile column and Sits
 * beside Sit Stories.
 */
export const ParentDashboard = ({
  header,
  summary,
  completion,
  openReview,
  onReviewAutoOpened,
}: {
  /** Profile block and mode switch (DashboardHeader). */
  header: React.ReactNode;
  summary: DashboardSummary | undefined;
  completion: Completion;
  openReview: string | null;
  onReviewAutoOpened: (sitId: string) => void;
}) => {
  const { data: listings = [], isLoading: listingsLoading } = useOwnerListings();
  const { atLimit, maxListings } = useListingAllowance();
  const { unreadCount } = useUnreadMessages();
  const { data: stories = [] } = useMySitStories();
  const { data: sits = [] } = useSits();
  const guideTodo = useGuideTodo(listings[0]?.id);
  const [reviewRequest, setReviewRequest] = useState<string | null>(null);

  const current = summary?.current_sits.find((s) => s.role === "owner") ?? null;
  const next = summary?.next_sits.find((s) => s.role === "owner") ?? null;
  const applicantsByListing = new Map((summary?.new_applicants ?? []).map((a) => [a.listing_id, a.count]));
  const totalApplicants = (summary?.new_applicants ?? []).reduce((n, a) => n + a.count, 0);

  const todos = useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [];
    if (totalApplicants > 0) {
      items.push({ key: "applicants", icon: Users, label: `Review ${plural(totalApplicants, "new applicant")}`, urgent: true, to: "/applications" });
    }
    for (const story of stories.filter((s) => s.role === "owner" && s.status === "ready" && s.portfolio_status === "requested")) {
      items.push({
        key: `portfolio-${story.id}`,
        icon: BookHeart,
        label: `${story.other_first_name} would like to show your Sit Story`,
        detail: "You choose if it appears",
        to: `/stories/${story.id}`,
      });
    }
    if (guideTodo) items.push(guideTodo);
    const todayIso = new Date().toISOString().slice(0, 10);
    const needsDates = listings.find(
      (l) => l.status === "published" && !l.sit_dates.some((d) => d.status === "open" && d.end_date >= todayIso),
    );
    if (needsDates && !current && !next) {
      items.push({ key: "dates", icon: CalendarPlus, label: "Add new dates", detail: "So Nomads can find your home", to: `/edit-listing/${needsDates.id}?focus=dates` });
    }
    for (const r of (summary?.reviews_due ?? []).filter((x) => x.role === "owner")) {
      items.push({
        key: `review-${r.sit_id}`,
        icon: Star,
        label: `Leave a review for ${r.other_first_name}`,
        detail: r.days_left <= 3 ? `${plural(r.days_left, "day")} left` : "Your review helps other Pet Parents",
        onClick: () => setReviewRequest(r.sit_id),
      });
    }
    if (unreadCount > 0) {
      items.push({ key: "messages", icon: MessageSquare, label: `Reply to ${plural(unreadCount, "message")}`, to: "/inbox" });
    }
    if (completion.percent < 100) {
      items.push({ key: "profile", icon: User, label: "Finish your profile", detail: `${completion.percent}% done`, to: "/edit-owner-profile" });
    }
    return items;
  }, [totalApplicants, stories, guideTodo, listings, current, next, summary, unreadCount, completion.percent]);

  const reviewSitId = reviewRequest ?? openReview;
  // Same rule as SitsSection: without sits, To do (tablet) and Sit Stories
  // (desktop) take the full width.
  const hasSits = !!reviewSitId || sits.some((s) => s.status !== "cancelled" || s.cancelled_from_status === "in_progress");

  return (
    <DashboardColumns
      aside={
        <>
          {header}
          <TodoList items={todos} className="hidden lg:block" />
        </>
      }
    >
      <TodoList items={todos} className={cn("md:order-3 lg:hidden", !hasSits && "md:col-span-2")} />
      <HomeSitCard current={current} next={next} className="md:order-1 md:col-span-2" />

      <div className="flex min-w-0 flex-col gap-[18px] md:order-2 md:col-span-2 md:gap-4 lg:gap-5">
      {listingsLoading ? (
        <Skeleton className="h-[420px] w-full rounded-[24px]" />
      ) : listings.length === 0 ? (
        <SectionCard className="flex flex-col items-center gap-2 p-6 text-center">
          <SerifTitle>Your home</SerifTitle>
          <p className="text-sm text-[#656B74]">Create your listing to find a Nomad for your pets.</p>
          <Link to="/create-listing" className={nnButton("primary", "mt-2")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create listing
          </Link>
        </SectionCard>
      ) : (
        <>
          {listings.map((listing) => (
            <OwnerListingCard key={listing.id} listing={listing} newApplicants={applicantsByListing.get(listing.id) ?? 0} />
          ))}
          {!atLimit && maxListings > 1 && (
            <Link to="/create-listing" className={nnButton("secondary", "self-start")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add another home
            </Link>
          )}
        </>
      )}
      </div>

      <SitsSection
        key={reviewSitId ?? "sits"}
        className="md:order-4"
        openReview={reviewSitId}
        onReviewAutoOpened={(id) => {
          setReviewRequest(null);
          onReviewAutoOpened(id);
        }}
      />
      <StoriesRow className={cn("md:order-5 md:col-span-2", hasSits && "lg:col-span-1")} />
    </DashboardColumns>
  );
};
