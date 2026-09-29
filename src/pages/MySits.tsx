import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookHeart, ChevronRight, Star } from "lucide-react";
import { parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/layout/Navbar";
import { Skeleton } from "@/components/ui/skeleton";
import WriteReviewDialog from "@/components/reviews/WriteReviewDialog";
import {
  NN_LIST,
  NN_MAIN,
  EmptyState,
  PageHeader,
  PillTabs,
  RoleTheme,
  SectionCard,
  StatusChip,
  nnButton,
  shortRange,
} from "@/components/nn/ui";
import { SitMoreMenu, SitRescheduleNotice } from "@/components/sits/SitActions";
import { useHasReviewed } from "@/hooks/useSitActions";
import { useSits, type Sit } from "@/hooks/useSits";
import { useStoryForSit } from "@/hooks/useSitStories";
import { useMyGuideWindows, daysUntil } from "@/hooks/useSitterGuide";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";
import { REVIEW_WINDOW_DAYS, reviewDaysLeft, sitChip, sitTiming } from "@/lib/sitTiming";

type Tab = "upcoming" | "past";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const SitRow = ({ sit, role }: { sit: Sit; role: "sitter" | "owner" }) => {
  const t = sitTiming(sit);
  const chip = sitChip(sit);
  const other = (role === "owner" ? sit.sitter_profile : sit.owner_profile)?.first_name || (t.otherLeft ? "Former member" : null);
  const { data: windows = [] } = useMyGuideWindows();
  const guide = role === "sitter" && t.isUpcoming ? windows.find((w) => w.sit_id === sit.id) : undefined;
  const past = t.isPast && !t.isUpcoming;
  const { data: story } = useStoryForSit(past && !t.isEarlyCancelled ? sit.id : undefined);
  const { data: hasReviewed } = useHasReviewed(sit.id, past && t.isReviewable && !t.otherLeft);
  const daysLeft = reviewDaysLeft(sit);
  const reviewOpen = daysLeft === null || daysLeft > 0;
  const canReview = past && t.isReviewable && !t.otherLeft && hasReviewed === false && reviewOpen;
  const revieweeId = role === "owner" ? sit.sitter_user_id : sit.owner_user_id;
  const queryClient = useQueryClient();

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--nn-line)] py-3 first:border-t-0">
      <div className="flex items-center gap-3">
        <Link to={`/sits/${sit.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] bg-[#CDB79E]">
            {sit.listing?.photos?.[0] && <img src={sit.listing.photos[0]} alt="" className="h-full w-full object-cover" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] font-bold">{sit.listing?.title ?? "A sit"}</span>
            <span className="truncate text-[13px] text-muted-foreground">
              {[sit.listing?.city, sit.sit_dates && shortRange(sit.sit_dates.start_date, sit.sit_dates.end_date), other]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="mt-1 self-start">
              <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
            </span>
          </span>
        </Link>
        {!past && (
          <SitMoreMenu sit={sit} items={["message", "sitPage", "arrival", "guide", "askNest", "propose", "listing"]} />
        )}
      </div>

      {guide && (
        <p className="text-[13px] text-muted-foreground">
          Welcome Guide:{" "}
          {guide.access_open ? (
            <span className="font-semibold text-[var(--nn-ok-text)]">arrival details ready</span>
          ) : (
            `arrival details unlock in ${plural(daysUntil(guide.unlock_at), "day")}`
          )}
        </p>
      )}

      {!past && <SitRescheduleNotice sit={sit} />}

      {story?.status === "ready" && (
        <Link
          to={`/stories/${story.id}`}
          className="flex min-h-[44px] items-center justify-between gap-2 rounded-[14px] bg-[var(--nn-soft)] px-3.5 text-sm font-bold"
        >
          <span className="flex min-w-0 items-center gap-2">
            <BookHeart className="h-4 w-4 shrink-0 text-[var(--nn-accent-dark)]" aria-hidden="true" />
            <span className="truncate">Read the Sit Story{story.title ? `: ${story.title}` : ""}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}

      {canReview && revieweeId && (
        <div className="flex flex-col gap-1">
          <WriteReviewDialog
            sitId={sit.id}
            revieweeUserId={revieweeId}
            revieweeName={other ?? "them"}
            reviewType={role === "owner" ? "sitter" : "owner"}
            onReviewSubmitted={() => queryClient.invalidateQueries({ queryKey: ["has-reviewed", sit.id] })}
            trigger={
              <button type="button" className={nnButton("secondary", "w-full")}>
                <Star className="h-4 w-4" aria-hidden="true" />
                Leave a review for {other}
              </button>
            }
          />
          {daysLeft !== null && (
            <p className="text-center text-xs text-muted-foreground">
              {daysLeft === 1 ? "Last day to leave your review" : `${daysLeft} days left to leave your review`}
            </p>
          )}
        </div>
      )}
      {past && t.isReviewable && !t.otherLeft && hasReviewed === false && !reviewOpen && (
        <p className="text-xs text-muted-foreground">The {REVIEW_WINDOW_DAYS}-day review window for this sit has closed.</p>
      )}
      {past && hasReviewed && <p className="text-xs text-muted-foreground">You reviewed {other}.</p>}
    </div>
  );
};

/**
 * My sits: every sit as the Nomad or as the Pet Parent (?as=sitter|owner,
 * else the dashboard's mode), Upcoming and Past, with each sit's actions.
 * Styled like My applications.
 */
const MySits = () => {
  const { user, role } = useAuth();
  const { activeRole } = useActiveRole();
  const [params, setParams] = useSearchParams();
  const as = params.get("as");
  const viewRole: "sitter" | "owner" =
    as === "owner" || as === "sitter"
      ? as
      : role === "both"
        ? activeRole === "owner"
          ? "owner"
          : "sitter"
        : role === "owner"
          ? "owner"
          : "sitter";
  const [tab, setTab] = useState<Tab>(params.get("tab") === "past" ? "past" : "upcoming");
  const { data: sits = [], isLoading } = useSits();

  const { upcoming, past } = useMemo(() => {
    const mine = sits.filter((s) => (viewRole === "sitter" ? s.sitter_user_id === user?.id : s.owner_user_id === user?.id));
    const byStart = (s: Sit) => (s.sit_dates ? parseISO(s.sit_dates.start_date).getTime() : 0);
    const byEnd = (s: Sit) => (s.sit_dates ? parseISO(s.sit_dates.end_date).getTime() : 0);
    return {
      upcoming: mine.filter((s) => sitTiming(s).isUpcoming).sort((a, b) => byStart(a) - byStart(b)),
      past: mine.filter((s) => sitTiming(s).isPast && !sitTiming(s).isUpcoming).sort((a, b) => byEnd(b) - byEnd(a)),
    };
  }, [sits, user?.id, viewRole]);

  const pick = (t: Tab) => {
    setTab(t);
    const next = new URLSearchParams(params);
    if (t === "past") next.set("tab", "past");
    else next.delete("tab");
    setParams(next, { replace: true });
  };

  const list = tab === "upcoming" ? upcoming : past;

  return (
    <RoleTheme role={viewRole} className="min-h-screen">
      <Navbar wide />
      <main className={NN_MAIN}>
        <PageHeader
          title="My sits"
          intro={viewRole === "owner" ? "Sits at your home, coming up and done." : "Your sits as a Nomad, coming up and done."}
          fallback="/dashboard"
        />
        <div className={NN_LIST}>
          <PillTabs<Tab>
            label="Filter sits"
            value={tab}
            onChange={pick}
            tabs={[
              { id: "upcoming", label: "Upcoming", count: upcoming.length },
              { id: "past", label: "Past", count: past.length },
            ]}
          />
          {isLoading ? (
            <Skeleton className="h-40 w-full rounded-[24px]" />
          ) : list.length === 0 ? (
            tab === "upcoming" ? (
              <EmptyState
                title="No upcoming sits"
                text={
                  viewRole === "owner"
                    ? "When you confirm a Nomad for your home, the sit shows up here."
                    : "When a Pet Parent confirms you for a sit, it shows up here."
                }
                action={
                  <Link to={viewRole === "owner" ? "/applications" : "/browse-sits"} className={nnButton("primary")}>
                    {viewRole === "owner" ? "See applicants" : "Browse sits"}
                  </Link>
                }
              />
            ) : (
              <EmptyState title="No past sits yet" text="Finished sits, their Sit Stories and reviews show up here." />
            )
          ) : (
            <SectionCard label={tab === "upcoming" ? "Upcoming sits" : "Past sits"} className="px-[18px] py-1.5">
              {list.map((s) => (
                <SitRow key={s.id} sit={s} role={viewRole} />
              ))}
            </SectionCard>
          )}
        </div>
      </main>
    </RoleTheme>
  );
};

export default MySits;
