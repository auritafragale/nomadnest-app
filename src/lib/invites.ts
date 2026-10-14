export type InviteStatus = "pending" | "viewed" | "applied" | "declined";

/** Live invitations (still waiting for an answer) and applied ones count as
 *  "already invited". A declined range can be invited again. */
export const blocksReinvite = (status: string) => status === "pending" || status === "viewed" || status === "applied";

/** What the Pet Parent sees under a date range for one Nomad. */
export type RangeInviteState = "waiting" | "applied" | "declined" | null;

export const rangeInviteState = (statuses: string[]): RangeInviteState => {
  if (statuses.some((s) => s === "pending" || s === "viewed")) return "waiting";
  if (statuses.includes("applied")) return "applied";
  if (statuses.includes("declined")) return "declined";
  return null;
};

/** The picked ranges that can be invited now (no live or applied invitation). */
export const invitableRanges = (picked: string[], existing: { sit_dates_id: string; status: string }[]) => {
  const blocked = new Set(existing.filter((r) => blocksReinvite(r.status)).map((r) => r.sit_dates_id));
  return picked.filter((id) => !blocked.has(id));
};

/** Another live invitation for the same range (the Pet Parent invited again
 *  after this one was declined). Undoing the decline would make two. */
export const hasNewerLiveInvite = (
  invite: { id: string; sit_dates_id: string },
  all: { id: string; sit_dates_id: string; status: string }[],
) => all.some((o) => o.id !== invite.id && o.sit_dates_id === invite.sit_dates_id && (o.status === "pending" || o.status === "viewed"));

/** The database refused because of the one-live-invitation-per-range rule. */
export const isLiveInviteConflict = (err: unknown) => (err as { code?: string } | null)?.code === "23505";
