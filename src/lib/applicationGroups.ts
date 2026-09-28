import type { SitterApplication } from "@/hooks/useSitterApplications";
import type { ChipTone } from "@/components/nn/ui";

export type ApplicationGroup = "accepted" | "pending" | "past";

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Accepted: accepted and the sit hasn't ended. Pending: waiting to hear
 * back. Past: everything else (ended, declined, withdrawn, cancelled).
 */
export const applicationGroup = (a: SitterApplication, today = todayIso()): ApplicationGroup => {
  const ended = !!a.sit_dates?.end_date && a.sit_dates.end_date < today;
  if (a.status === "accepted" && !ended) return "accepted";
  if ((a.status === "applied" || a.status === "shortlisted") && !ended) return "pending";
  return "past";
};

export const applicationChip = (a: SitterApplication, today = todayIso()): { label: string; tone: ChipTone } => {
  const group = applicationGroup(a, today);
  if (group === "accepted") {
    const live = !!a.sit_dates && a.sit_dates.start_date <= today && a.sit_dates.end_date >= today;
    return { label: live ? "Sit now" : "Accepted", tone: "green" };
  }
  if (group === "pending") return { label: a.status === "shortlisted" ? "Shortlisted" : "Pending", tone: "accent" };
  switch (a.status) {
    case "declined":
      return { label: "Declined", tone: "grey" };
    case "withdrawn":
      return { label: "Withdrawn", tone: "grey" };
    case "cancelled":
      return { label: "Cancelled", tone: "grey" };
    default:
      return { label: "Past", tone: "grey" };
  }
};

export const groupApplications = (apps: SitterApplication[]) => {
  const today = todayIso();
  // One row per date range for repeated cancelled attempts (most recent kept).
  const seen = new Set<string>();
  const visible = apps.filter((a) => {
    if (a.status !== "cancelled") return true;
    if (seen.has(a.sit_dates_id)) return false;
    seen.add(a.sit_dates_id);
    return true;
  });
  const by = (g: ApplicationGroup) => visible.filter((a) => applicationGroup(a, today) === g);
  const byStart = (x: SitterApplication, y: SitterApplication) =>
    (x.sit_dates?.start_date ?? "").localeCompare(y.sit_dates?.start_date ?? "");
  return {
    all: visible,
    accepted: by("accepted").sort(byStart),
    pending: by("pending").sort(byStart),
    past: by("past").sort((x, y) => byStart(y, x)),
  };
};
