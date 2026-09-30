import { addDays, differenceInCalendarDays, isAfter, isBefore, isSameDay, isWithinInterval, parseISO, startOfToday } from "date-fns";
import type { Sit } from "@/hooks/useSits";
import type { ChipTone } from "@/components/nn/ui";

/**
 * Where a sit stands today, derived from its dates so it's right even before
 * the nightly job promotes the row (confirmed -> in progress -> completed).
 * Same rules the old dashboard Sits card used.
 */
export const sitTiming = (sit: Sit, today = startOfToday()) => {
  const start = sit.sit_dates?.start_date ? parseISO(sit.sit_dates.start_date) : null;
  const end = sit.sit_dates?.end_date ? parseISO(sit.sit_dates.end_date) : null;
  const live = sit.status === "confirmed" || sit.status === "in_progress";
  const isCurrent = live && !!start && !!end && start <= today && end >= today;
  const isFinished = live && !!end && end < today;
  const isEarlyCancelled = sit.status === "cancelled" && sit.cancelled_from_status === "in_progress";
  const isUpcoming =
    live && !!start && !!end && (isAfter(start, today) || isSameDay(start, today) || isWithinInterval(today, { start, end }));
  // A sit cancelled before it started isn't a past sit.
  const isPast = !!end && (sit.status === "cancelled" ? isEarlyCancelled : sit.status === "completed" || isBefore(end, today));
  const otherLeft = sit.other_member_left;
  return {
    start,
    end,
    isCurrent,
    isFinished,
    isUpcoming,
    isPast,
    isEarlyCancelled,
    otherLeft,
    canCancel: live && !isFinished && !otherLeft,
    isReviewable: sit.status === "completed" || isEarlyCancelled,
  };
};

/**
 * The Arrival Check-In window: from the day before the sit starts until two
 * days after it starts.
 */
export const arrivalWindowOpen = (startDate: string | null | undefined, today = startOfToday()) => {
  if (!startDate) return false;
  const start = parseISO(startDate);
  return !isBefore(today, addDays(start, -1)) && !isAfter(today, addDays(start, 2));
};

/** Reviews stay open for 14 days after the sit ended (or was cut short). */
export const REVIEW_WINDOW_DAYS = 14;
export const reviewDaysLeft = (sit: Sit, today = startOfToday()) => {
  const anchor = sit.status === "cancelled" ? sit.cancelled_at : sit.sit_dates?.end_date;
  if (!anchor) return null;
  return Math.max(0, REVIEW_WINDOW_DAYS - differenceInCalendarDays(today, parseISO(anchor)));
};

export const sitChip = (sit: Sit): { label: string; tone: ChipTone } => {
  const t = sitTiming(sit);
  if (t.isEarlyCancelled) return { label: "Cancelled early", tone: "grey" };
  if (sit.status === "cancelled") return { label: "Cancelled", tone: "grey" };
  if (t.isCurrent) return { label: "Now", tone: "solid" };
  if (sit.status === "completed" || t.isFinished) return { label: "Completed", tone: "grey" };
  return { label: "Confirmed", tone: "green" };
};
