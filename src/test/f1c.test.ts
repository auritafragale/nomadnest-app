import { describe, expect, it } from "vitest";
import { otherOpenDates, rangesOverlap } from "@/lib/dateRanges";
import { blocksReinvite, invitableRanges, rangeInviteState } from "@/lib/invites";
import { authErrorMeansEnded, isSignInEndedCandidate, sessionHasEnded } from "@/lib/signInCheck";
import { contentTypeFor, fitWithin } from "@/lib/idUpload";
import { errorBody, getUserFailureReason, REASON_STATUS, statusFor } from "../../supabase/functions/_shared/http-status";

const r = (id: string, start_date: string, end_date: string) => ({ id, start_date, end_date });

describe("other open dates vs confirmed sits (F1b)", () => {
  const confirmed = [r("c", "2026-11-02", "2026-11-04")];
  it("drops a range that overlaps a confirmed sit, keeps the rest", () => {
    const open = [r("a", "2026-10-15", "2026-10-17"), r("b", "2026-11-03", "2026-11-06"), r("d", "2026-11-20", "2026-11-25")];
    expect(otherOpenDates(open, confirmed).map((d) => d.id)).toEqual(["a", "d"]);
  });
  it("counts touching ends as overlapping (inclusive)", () => {
    expect(rangesOverlap(r("x", "2026-11-04", "2026-11-08"), confirmed[0])).toBe(true);
    expect(rangesOverlap(r("y", "2026-10-30", "2026-11-02"), confirmed[0])).toBe(true);
    expect(rangesOverlap(r("z", "2026-11-05", "2026-11-08"), confirmed[0])).toBe(false);
  });
  it("keeps everything with no confirmed sits", () => {
    expect(otherOpenDates([r("a", "2026-10-15", "2026-10-17")], [])).toHaveLength(1);
  });
});

// Updated for F1e: an "applied" invitation only blocks while its
// application is live (passed in separately).
describe("which invitations count as already invited (F1c, F1e)", () => {
  it("live invitations block a re-invite; declined does not; applied only with a live application", () => {
    expect(blocksReinvite("pending")).toBe(true);
    expect(blocksReinvite("viewed")).toBe(true);
    expect(blocksReinvite("applied")).toBe(false);
    expect(blocksReinvite("applied", true)).toBe(true);
    expect(blocksReinvite("declined")).toBe(false);
  });
  it("keeps a declined range invitable, drops live ones and live applications", () => {
    const existing = [
      { sit_dates_id: "r1", status: "declined" },
      { sit_dates_id: "r2", status: "pending" },
      { sit_dates_id: "r3", status: "applied" },
    ];
    expect(invitableRanges(["r1", "r2", "r3", "r4"], existing, ["r3"])).toEqual(["r1", "r4"]);
    expect(invitableRanges(["r1", "r2", "r3", "r4"], existing)).toEqual(["r1", "r3", "r4"]);
  });
  it("re-invited after a decline shows as waiting", () => {
    expect(rangeInviteState(["declined", "pending"])).toBe("waiting");
    expect(rangeInviteState(["declined"])).toBe("declined");
    expect(rangeInviteState(["applied", "declined"], true)).toBe("applied");
    expect(rangeInviteState([])).toBeNull();
  });
});

describe("the sign-in-ended decision (F1c)", () => {
  const probe = (user: boolean, refresh: boolean) => ({ getUser: async () => user, refresh: async () => refresh });
  it("getUser ok: not ended", async () => expect(await sessionHasEnded(probe(true, false))).toBe(false));
  it("refresh ok: not ended", async () => expect(await sessionHasEnded(probe(false, true))).toBe(false));
  it("both fail: ended", async () => expect(await sessionHasEnded(probe(false, false))).toBe(true));
  it("a throwing probe counts as a failure", async () => {
    const boom = async () => {
      throw new Error("x");
    };
    expect(await sessionHasEnded({ getUser: boom, refresh: boom })).toBe(true);
  });
  it("network errors and outages never mean ended", () => {
    expect(authErrorMeansEnded({ status: 0 })).toBe(false);
    expect(authErrorMeansEnded({ status: 503 })).toBe(false);
    expect(authErrorMeansEnded({})).toBe(false);
    expect(authErrorMeansEnded({ status: 401 })).toBe(true);
    expect(authErrorMeansEnded({ status: 403 })).toBe(true);
    expect(authErrorMeansEnded(null)).toBe(false);
  });
  it("only some 401s are worth checking", () => {
    const base = { status: 401, supabaseUrl: "https://x.supabase.co", hasStoredSession: true };
    expect(isSignInEndedCandidate({ ...base, url: "https://x.supabase.co/functions/v1/nomad-match", body: { reason: "auth_get_user_failed" } })).toBe(true);
    expect(isSignInEndedCandidate({ ...base, url: "https://x.supabase.co/functions/v1/nomad-match", body: { reason: "auth_missing_token" } })).toBe(false);
    expect(isSignInEndedCandidate({ ...base, url: "https://x.supabase.co/auth/v1/user", body: {} })).toBe(false);
    expect(isSignInEndedCandidate({ ...base, status: 403, url: "https://x.supabase.co/functions/v1/a", body: {} })).toBe(false);
    expect(isSignInEndedCandidate({ ...base, hasStoredSession: false, url: "https://x.supabase.co/functions/v1/a", body: {} })).toBe(false);
    expect(isSignInEndedCandidate({ ...base, url: "https://x.supabase.co/rest/v1/sits", body: { code: "PGRST301" } })).toBe(true);
    expect(isSignInEndedCandidate({ ...base, url: "https://x.supabase.co/rest/v1/sits", body: { code: "42501" } })).toBe(false);
  });
});

describe("image prep sizing (F1c)", () => {
  it("caps the long side at 2000px, keeping the shape", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000 });
  });
  it("never scales up", () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(2000, 2000)).toEqual({ width: 2000, height: 2000 });
  });
  it("types files with an empty type from their extension", () => {
    expect(contentTypeFor("IMG_1.HEIC", "")).toBe("image/heic");
    expect(contentTypeFor("scan.pdf", "")).toBe("application/pdf");
    expect(contentTypeFor("photo", "image/jpg")).toBe("image/jpeg");
    expect(contentTypeFor("photo", "")).toBeNull();
  });
});

describe("edge-function status helper (F1c)", () => {
  it("401 only for sign-in problems", () => {
    const four01 = Object.entries(REASON_STATUS).filter(([, s]) => s === 401).map(([k]) => k);
    expect(four01.sort()).toEqual(["auth_get_user_failed", "auth_missing_token"]);
    expect(statusFor("admin_only")).toBe(403);
    expect(statusFor("feature_off")).toBe(403);
    expect(statusFor("internal_only")).toBe(403);
    expect(statusFor("bad_input")).toBe(400);
  });
  it("every error body has a reason", () => {
    expect(errorBody("not_allowed", "No.", { remaining: 0 })).toEqual({ error: "No.", reason: "not_allowed", remaining: 0 });
  });
  it("an auth outage is not a 401", () => {
    expect(getUserFailureReason({ status: 500 })).toBe("auth_unavailable");
    expect(getUserFailureReason({ status: 0 })).toBe("auth_unavailable");
    expect(statusFor(getUserFailureReason({ status: 503 }))).toBe(503);
    expect(getUserFailureReason({ status: 403 })).toBe("auth_get_user_failed");
    expect(getUserFailureReason(null)).toBe("auth_get_user_failed");
  });
});
