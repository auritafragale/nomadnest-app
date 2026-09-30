import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO, startOfToday } from "date-fns";
import { BookOpen, BookHeart, Calendar, Camera, ChevronRight, Mail, MessageSquare, Sparkles, Star, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NavRow, SectionCard, SerifTitle, StatusChip, nnButton, shortRange } from "@/components/nn/ui";
import { TodoList, type TodoItem } from "@/components/dashboard/TodoList";
import { SitMoreMenu, SitRescheduleNotice } from "@/components/sits/SitActions";
import { ArrivalCheckInRow } from "@/components/sits/ArrivalCheckInRow";
import { useArrivalPhotoCount } from "@/hooks/useArrivalVault";
import { useAuth } from "@/contexts/AuthContext";
import { arrivalWindowOpen, sitTiming } from "@/lib/sitTiming";
import { AskNestSheet } from "@/components/welcome-guide/AskNestSheet";
import WriteReviewDialog from "@/components/reviews/WriteReviewDialog";
import { useSits } from "@/hooks/useSits";
import { useMyGuideWindows, daysUntil } from "@/hooks/useSitterGuide";
import { useAskNestAvailable } from "@/hooks/useAskNest";
import { useSitterApplications } from "@/hooks/useSitterApplications";
import { usePendingInvitesCount } from "@/hooks/useSitterInvites";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useMyAvailability } from "@/hooks/useMyAvailability";
import { useMySitStories } from "@/hooks/useSitStories";
import type { CurrentSit, DashboardSummary, NextSit } from "@/hooks/useDashboardSummary";
import { applicationChip, groupApplications } from "@/lib/applicationGroups";
import { resolveListingConversation } from "@/lib/conversations";
import type { Completion } from "@/lib/profileCompletion";
import { DashboardColumns } from "@/components/dashboard/DashboardColumns";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Pets' names for a listing (public on published listings). */
const usePetNames = (listingId: string | null | undefined) =>
  useQuery({
    queryKey: ["listing-pet-names", listingId],
    queryFn: async () => {
      const { data } = await supabase.from("pets").select("name, type").eq("listing_id", listingId!);
      const names = (data ?? []).map((p) => p.name || p.type).filter(Boolean) as string[];
      return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    },
    enabled: !!listingId,
  });

const Tile = ({
  to,
  onClick,
  icon: Icon,
  title,
  detail,
  tone,
}: {
  to?: string;
  onClick?: () => void;
  icon: typeof BookOpen;
  title: string;
  detail: string;
  tone: "teal" | "accent" | "neutral";
}) => {
  const iconCls =
    tone === "teal"
      ? "bg-[var(--nn-ok-bg)] text-brand-teal-text"
      : tone === "accent"
        ? "bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]"
        : "bg-[var(--nn-chip)] text-muted-foreground";
  const body = (
    <>
      <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-full ${iconCls}`}>
        <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
      </span>
      <span className="text-[13px] font-bold">{title}</span>
      <span className={`text-[11px] ${tone === "teal" ? "font-semibold text-brand-teal-text" : "text-muted-foreground"}`}>{detail}</span>
    </>
  );
  const cls = "flex min-h-[44px] flex-col gap-1.5 rounded-2xl bg-[var(--nn-soft)] px-2.5 py-3 text-left";
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
};

/** "Your sit now" (Day N of M) or, before it starts, the next sit's countdown. */
const YourSitCard = ({ current, next }: { current: CurrentSit | null; next: NextSit | null }) => {
  const navigate = useNavigate();
  const sitId = current?.sit_id ?? next?.sit_id;
  const { data: sits = [] } = useSits();
  const sit = sits.find((s) => s.id === sitId);
  const listingId = current?.listing_id ?? next?.listing_id;
  const { data: pets } = usePetNames(listingId);
  const { data: windows = [] } = useMyGuideWindows();
  const guideWindow = windows.find((w) => w.sit_id === sitId);
  const askNestAvailable = useAskNestAvailable();
  const [askOpen, setAskOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const { user } = useAuth();
  const upcomingCount = sits.filter((x) => x.sitter_user_id === user?.id && sitTiming(x).isUpcoming).length;

  if (!current && !next) return null;
  const s = current ?? next!;
  const photo = sit?.listing?.photos?.[0];
  const other = s.other_first_name;
  const dueNow = !!current && current.due_today && !current.sent_today;
  const days = next ? differenceInCalendarDays(parseISO(next.start_date), startOfToday()) : 0;

  const openChat = async () => {
    if (!sit || opening) return;
    setOpening(true);
    try {
      const id = await resolveListingConversation({
        listingId: sit.listing_id,
        ownerUserId: sit.owner_user_id,
        sitterUserId: sit.sitter_user_id,
      });
      navigate(id ? `/inbox?conversation=${id}` : "/inbox");
    } catch {
      navigate("/inbox");
    } finally {
      setOpening(false);
    }
  };

  return (
    <SectionCard
      label={current ? "Your sit now" : "Your next sit"}
      className="overflow-hidden md:col-span-2 md:grid md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]"
    >
      <div className="relative flex h-[150px] items-center justify-center bg-[#CDB79E] md:h-auto md:min-h-[300px]">
        {photo && <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <span className="absolute left-3 top-3 inline-flex h-7 items-center rounded-full bg-card px-3 text-xs font-bold text-[var(--nn-accent-dark)]">
          {current ? "Your sit now" : "Your next sit"}
        </span>
        <span className="absolute right-3 top-3 inline-flex h-7 items-center rounded-full bg-[var(--nn-accent)] px-3 text-xs font-bold text-primary-foreground">
          {current
            ? `Day ${current.day_number} of ${current.total_days}`
            : days <= 0
              ? "Starts today"
              : days === 1
                ? "Starts tomorrow"
                : `Starts in ${days} days`}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-3.5 p-[18px] md:p-5 xl:p-6">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="font-display text-[25px] font-normal leading-[1.1] xl:text-[30px]">{s.listing_title}</h2>
            <p className="text-sm text-muted-foreground">
              {[`With ${other}`, pets, shortRange(s.start_date, s.end_date)].filter(Boolean).join(" · ")}
            </p>
          </div>
          {sit && <SitMoreMenu sit={sit} items={["listing", "guide", "arrival"]} />}
        </div>
        {sit && <SitRescheduleNotice sit={sit} />}
        {current && (
          <div
            role="progressbar"
            aria-label="Sit progress"
            aria-valuenow={current.day_number}
            aria-valuemin={0}
            aria-valuemax={current.total_days}
            className="h-1.5 rounded-full bg-muted"
          >
            <div
              className="h-1.5 rounded-full bg-[var(--nn-accent)]"
              style={{ width: `${Math.min(100, Math.round((current.day_number / Math.max(1, current.total_days)) * 100))}%` }}
            />
          </div>
        )}
        {current && (current.sent_today || current.due_today) && (
          <div
            className={`flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 text-sm leading-snug ${
              current.sent_today ? "bg-[var(--nn-ok-bg)] text-brand-teal-text" : "bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]"
            }`}
          >
            <Camera className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              {current.sent_today ? (
                <strong>Today's update is sent.</strong>
              ) : (
                <>
                  <strong>Today's update isn't sent yet.</strong> {other} is waiting to hear how it's going.
                </>
              )}
            </span>
          </div>
        )}
        <Link
          to={`/sits/${s.sit_id}`}
          className={`flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[15px] font-bold ${
            dueNow ? "bg-[var(--nn-accent)] text-primary-foreground" : "border-[1.5px] border-[var(--nn-border)] bg-card text-foreground"
          }`}
        >
          {dueNow && <Camera className="h-[18px] w-[18px]" aria-hidden="true" />}
          {dueNow ? "Send today's update" : current ? "Open your sit" : "View sit"}
        </Link>
        <div className="grid grid-cols-3 gap-2">
          {guideWindow ? (
            <Tile
              to={`/listing/${guideWindow.listing_id}/welcome-guide`}
              icon={BookOpen}
              title="Welcome Guide"
              detail={guideWindow.access_open ? "Arrival details ready" : `Unlocks in ${plural(daysUntil(guideWindow.unlock_at), "day")}`}
              tone={guideWindow.access_open ? "teal" : "neutral"}
            />
          ) : (
            <Tile to={`/listing/${listingId}`} icon={BookOpen} title="The home" detail="View listing" tone="neutral" />
          )}
          {guideWindow && askNestAvailable ? (
            <Tile onClick={() => setAskOpen(true)} icon={Sparkles} title="Ask the Nest" detail="Ask about the home" tone="accent" />
          ) : (
            <Tile to={`/sits/${s.sit_id}`} icon={Calendar} title="Your sit" detail="Updates and dates" tone="accent" />
          )}
          <Tile onClick={openChat} icon={MessageSquare} title="Message" detail={`Chat with ${other}`} tone="neutral" />
        </div>
        <ArrivalCheckInRow sitId={s.sit_id} startDate={s.start_date} />
        <Link
          to="/my-sits?as=sitter"
          className="-my-1 flex min-h-[44px] items-center justify-between text-sm font-bold text-[var(--nn-accent-dark)]"
        >
          {upcomingCount > 1 ? `See all sits (${upcomingCount} coming up)` : "See all sits"}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      {guideWindow && askNestAvailable && listingId && (
        <AskNestSheet listingId={listingId} open={askOpen} onOpenChange={setAskOpen} />
      )}
    </SectionCard>
  );
};

const CountTile = ({ to, count, label, tone }: { to: string; count: number; label: string; tone: "green" | "accent" | "grey" }) => (
  <Link
    to={to}
    className={`flex min-h-[44px] flex-col gap-0.5 rounded-2xl p-3 ${
      tone === "green"
        ? "bg-[var(--nn-ok-bg)] text-brand-teal-text"
        : tone === "accent"
          ? "bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]"
          : "bg-muted text-muted-foreground"
    }`}
  >
    <span className="font-display text-[26px] leading-none">{count}</span>
    <span className="text-xs font-bold">{label}</span>
  </Link>
);

/** "My applications": three counts, the latest three, See all. */
const ApplicationsSummary = () => {
  const { data: apps = [], isLoading } = useSitterApplications();
  const groups = useMemo(() => groupApplications(apps), [apps]);
  const latest = [...groups.all].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);

  return (
    <SectionCard label="My applications" className="flex flex-col gap-3.5 p-[18px]">
      <div className="flex items-baseline justify-between">
        <SerifTitle>My applications</SerifTitle>
        {groups.all.length > 0 && (
          <Link to="/my-applications" className="-my-3 inline-flex min-h-[44px] items-center text-sm font-bold text-[var(--nn-accent-dark)]">
            See all {groups.all.length}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <CountTile to="/my-applications?tab=accepted" count={groups.accepted.length} label="Accepted" tone="green" />
        <CountTile to="/my-applications?tab=pending" count={groups.pending.length} label="Pending" tone="accent" />
        <CountTile to="/my-applications?tab=past" count={groups.past.length} label="Past" tone="grey" />
      </div>
      {isLoading ? null : latest.length === 0 ? (
        <div className="flex flex-col items-start gap-2 border-t border-[var(--nn-line)] pt-3">
          <p className="text-sm text-muted-foreground">You haven't applied for a sit yet.</p>
          <Link to="/browse-sits" className={nnButton("primary")}>
            Browse sits
          </Link>
        </div>
      ) : (
        <div className="flex flex-col">
          <span className="pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Latest</span>
          {latest.map((a) => {
            const chip = applicationChip(a);
            return (
              <Link
                key={a.id}
                to={`/listing/${a.listing_id}`}
                className="flex items-center gap-3 border-t border-[var(--nn-line)] py-2.5"
              >
                <span className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] bg-[#CDB79E]">
                  {a.listing?.photos?.[0] && <img src={a.listing.photos[0]} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-bold">{a.listing?.title ?? "A sit"}</span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {[a.listing?.city, a.sit_dates && shortRange(a.sit_dates.start_date, a.sit_dates.end_date)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
              </Link>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
};

/** Invitations, Availability and Sit Stories: what the tiles and the list show. */
const useNomadProfileLinks = () => {
  const { data: pendingInvites = 0 } = usePendingInvitesCount();
  const { data: availability } = useMyAvailability();
  const { data: stories = [] } = useMySitStories();
  const mine = stories.filter((s) => s.role === "sitter" && s.status === "ready");
  const onProfile = mine.filter((s) => s.portfolio_status === "approved").length;
  const ranges = availability?.ranges ?? [];
  return {
    invites: { detail: pendingInvites > 0 ? `${pendingInvites} waiting` : "None waiting", urgent: pendingInvites > 0 },
    availability: { detail: ranges.length === 0 ? "Set your dates" : plural(ranges.length, "date range"), urgent: ranges.length === 0 },
    stories: {
      detail:
        mine.length === 0 ? "After your first sit" : onProfile > 0 ? `${onProfile} on your profile` : plural(mine.length, "story", "stories"),
    },
  };
};

/** "Your Nomad profile" as a list: the desktop profile column. */
const NomadProfileList = ({ className }: { className?: string }) => {
  const links = useNomadProfileLinks();
  return (
    <SectionCard label="Your Nomad profile" className={`px-[18px] py-1.5 ${className ?? ""}`}>
      <SerifTitle className="mb-1 mt-3">Your Nomad profile</SerifTitle>
      <NavRow
        to="/invitations"
        icon={Mail}
        title="Invitations"
        subtitle={links.invites.detail}
        subtitleTone={links.invites.urgent ? "accent" : "grey"}
        iconTone="neutral"
      />
      <NavRow
        to="/availability"
        icon={Calendar}
        title="Availability"
        subtitle={links.availability.detail}
        subtitleTone={links.availability.urgent ? "accent" : "grey"}
        iconTone="teal"
      />
      <NavRow to="/my-sit-stories" icon={BookHeart} title="Sit Stories" subtitle={links.stories.detail} />
    </SectionCard>
  );
};

/** "Your Nomad profile": Invitations, Availability and Sit Stories tiles (phone and tablet). */
const NomadProfileTiles = ({ className }: { className?: string }) => {
  const links = useNomadProfileLinks();

  const tile = (to: string, icon: typeof Mail, iconCls: string, title: string, detail: string, urgent = false) => (
    <Link
      to={to}
      className="flex min-h-[44px] flex-col gap-1.5 rounded-[18px] border border-[var(--nn-border)] bg-card px-3 py-3.5"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-full ${iconCls}`}>
        {(() => {
          const I = icon;
          return <I className="h-[17px] w-[17px]" aria-hidden="true" />;
        })()}
      </span>
      <span className="text-[13px] font-bold">{title}</span>
      <span className={`text-[11px] ${urgent ? "font-semibold text-[var(--nn-accent-dark)]" : "text-muted-foreground"}`}>{detail}</span>
    </Link>
  );

  return (
    <section aria-label="Your Nomad profile" className={`flex flex-col gap-3 ${className ?? ""}`}>
      <SerifTitle>Your Nomad profile</SerifTitle>
      <div className="grid grid-cols-3 gap-2">
        {tile(
          "/invitations",
          Mail,
          "bg-[var(--nn-chip)] text-muted-foreground",
          "Invitations",
          links.invites.detail,
          links.invites.urgent,
        )}
        {tile(
          "/availability",
          Calendar,
          "bg-[var(--nn-ok-bg)] text-brand-teal-text",
          "Availability",
          links.availability.detail,
          links.availability.urgent,
        )}
        {tile(
          "/my-sit-stories",
          BookHeart,
          "bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]",
          "Sit Stories",
          links.stories.detail,
        )}
      </div>
    </section>
  );
};

/**
 * The Nomad side of the dashboard. Phone: Main.dc.html, one column. Tablet
 * (md): NomadTablet.dc.html. Desktop (lg): NomadDesktop.dc.html, the profile
 * column on the left and the sit, To do and My applications on the right.
 */
export const NomadDashboard = ({
  header,
  summary,
  completion,
  openReviewSitId,
  onReviewHandled,
}: {
  /** Profile block and mode switch (DashboardHeader). */
  header: React.ReactNode;
  summary: DashboardSummary | undefined;
  completion: Completion;
  openReviewSitId: string | null;
  onReviewHandled: () => void;
}) => {
  const { unreadCount } = useUnreadMessages();
  const { data: pendingInvites = 0 } = usePendingInvitesCount();
  const { data: sits = [] } = useSits();
  const [reviewSitId, setReviewSitId] = useState<string | null>(null);
  const activeReviewId = reviewSitId ?? openReviewSitId;
  const reviewSit = sits.find((s) => s.id === activeReviewId);

  const current = summary?.current_sits.find((s) => s.role === "sitter") ?? null;
  const next = summary?.next_sits.find((s) => s.role === "sitter") ?? null;
  const { user } = useAuth();
  const arrivalSit = current ?? next;
  const inArrivalWindow = arrivalWindowOpen(arrivalSit?.start_date);
  const { data: arrivalPhotos } = useArrivalPhotoCount(arrivalSit?.sit_id, inArrivalWindow);
  const myPastSits = sits.filter((s) => s.sitter_user_id === user?.id && sitTiming(s).isPast).length;

  const todos = useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [];
    for (const sit of (summary?.current_sits ?? []).filter((s) => s.role === "sitter" && s.due_today && !s.sent_today)) {
      items.push({
        key: `update-${sit.sit_id}`,
        icon: Camera,
        label: `Send today's update to ${sit.other_first_name}`,
        detail: "Due today",
        urgent: true,
        to: `/sits/${sit.sit_id}`,
      });
    }
    if (arrivalSit && inArrivalWindow && arrivalPhotos === 0) {
      items.push({
        key: `arrival-${arrivalSit.sit_id}`,
        icon: Camera,
        label: "Take your Arrival Check-In photos",
        detail: "Only you can see these",
        urgent: true,
        to: `/sits/${arrivalSit.sit_id}/arrival-vault`,
      });
    }
    if (pendingInvites > 0) {
      items.push({
        key: "invites",
        icon: Mail,
        label: `Reply to ${plural(pendingInvites, "invitation")}`,
        detail: "A Pet Parent invited you",
        urgent: true,
        to: "/invitations",
      });
    }
    for (const r of (summary?.reviews_due ?? []).filter((x) => x.role === "sitter")) {
      items.push({
        key: `review-${r.sit_id}`,
        icon: Star,
        label: `Leave a review for ${r.other_first_name}`,
        detail: r.days_left <= 3 ? `${plural(r.days_left, "day")} left` : "Your review helps other Nomads",
        onClick: () => setReviewSitId(r.sit_id),
      });
    }
    if (unreadCount > 0) {
      items.push({ key: "messages", icon: MessageSquare, label: `Reply to ${plural(unreadCount, "message")}`, to: "/inbox" });
    }
    if (completion.percent < 100) {
      items.push({ key: "profile", icon: User, label: "Finish your profile", detail: `${completion.percent}% done`, to: "/edit-sitter-profile" });
    }
    return items;
  }, [summary, pendingInvites, unreadCount, completion.percent, arrivalSit, inArrivalWindow, arrivalPhotos]);

  const closeReview = () => {
    setReviewSitId(null);
    onReviewHandled();
  };

  return (
    <DashboardColumns
      aside={
        <>
          {header}
          <NomadProfileList className="hidden lg:block" />
        </>
      }
    >
      <YourSitCard current={current} next={next} />
      <TodoList items={todos} />
      <ApplicationsSummary />
      <NomadProfileTiles className="md:col-span-2 lg:hidden" />
      {/* Without a sit now or next, My sits (past sits, reviews, Sit Stories) is one tap away here. */}
      {!current && !next && myPastSits > 0 && (
        <SectionCard label="Your sits" className="px-[18px] py-1.5 md:col-span-2">
          <NavRow first to="/my-sits?as=sitter&tab=past" icon={Calendar} title="My sits" subtitle={plural(myPastSits, "past sit")} iconTone="neutral" />
        </SectionCard>
      )}

      {reviewSit && reviewSit.owner_user_id && (
        <WriteReviewDialog
          sitId={reviewSit.id}
          revieweeUserId={reviewSit.owner_user_id}
          revieweeName={reviewSit.owner_profile?.first_name || "your Pet Parent"}
          reviewType="owner"
          open
          onOpenChange={(open) => !open && closeReview()}
          onReviewSubmitted={closeReview}
        />
      )}
    </DashboardColumns>
  );
};
