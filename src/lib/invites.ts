export type InviteStatus = "pending" | "viewed" | "applied" | "declined";

/** An invitation still waiting for the Nomad's answer. */
export const isLiveInvite = (status: string) => status === "pending" || status === "viewed";

/** A live invitation blocks a re-invite. Since F1e an "applied" one only
 *  does while its application is live (pass that in): once the application
 *  ends (withdrawn, declined, cancelled), the range can be invited again. */
export const blocksReinvite = (status: string, applicationLive = false) => isLiveInvite(status) || applicationLive;

/** Live: waiting for an answer, or accepted with a confirmed or in-progress
 *  sit on that range. Anything else has ended. */
export const applicationIsLive = (
  app: { sit_dates_id: string; status: string },
  sits: { sit_dates_id: string | null; status: string }[],
) =>
  app.status === "applied" ||
  app.status === "shortlisted" ||
  (app.status === "accepted" && sits.some((s) => s.sit_dates_id === app.sit_dates_id && (s.status === "confirmed" || s.status === "in_progress")));

/** The ranges where this Nomad has a live application (one Nomad's rows). */
export const liveApplicationRanges = (
  apps: { sit_dates_id: string; status: string }[],
  sits: { sit_dates_id: string | null; status: string }[],
) => new Set(apps.filter((a) => applicationIsLive(a, sits)).map((a) => a.sit_dates_id));

/** What the Pet Parent sees under a date range for one Nomad. */
export type RangeInviteState = "waiting" | "applied" | "declined" | null;

export const rangeInviteState = (statuses: string[], hasLiveApplication = false): RangeInviteState => {
  if (hasLiveApplication) return "applied";
  if (statuses.some(isLiveInvite)) return "waiting";
  if (statuses.includes("declined")) return "declined";
  return null;
};

/** The picked ranges that can be invited now: no live invitation and no
 *  live application from this Nomad. */
export const invitableRanges = (
  picked: string[],
  existing: { sit_dates_id: string; status: string }[],
  liveApplications: Iterable<string> = [],
) => {
  const blocked = new Set([...existing.filter((r) => isLiveInvite(r.status)).map((r) => r.sit_dates_id), ...liveApplications]);
  return picked.filter((id) => !blocked.has(id));
};

/** Another live invitation for the same range (the Pet Parent invited again
 *  after this one was declined). Undoing the decline would make two. */
export const hasNewerLiveInvite = (
  invite: { id: string; sit_dates_id: string },
  all: { id: string; sit_dates_id: string; status: string }[],
) => all.some((o) => o.id !== invite.id && o.sit_dates_id === invite.sit_dates_id && isLiveInvite(o.status));

/** The database refused because of the one-live-invitation-per-range rule. */
export const isLiveInviteConflict = (err: unknown) => (err as { code?: string } | null)?.code === "23505";
