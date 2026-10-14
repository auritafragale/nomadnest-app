import { describe, expect, it } from "vitest";
import { applicationIsLive, invitableRanges, liveApplicationRanges, rangeInviteState } from "@/lib/invites";

const sit = (sit_dates_id: string | null, status: string) => ({ sit_dates_id, status });

describe("a live application locks a range (F1e)", () => {
  it("applied and shortlisted are live", () => {
    expect(applicationIsLive({ sit_dates_id: "r1", status: "applied" }, [])).toBe(true);
    expect(applicationIsLive({ sit_dates_id: "r1", status: "shortlisted" }, [])).toBe(true);
  });
  it("accepted is live only with a confirmed or in-progress sit on that range", () => {
    expect(applicationIsLive({ sit_dates_id: "r1", status: "accepted" }, [sit("r1", "confirmed")])).toBe(true);
    expect(applicationIsLive({ sit_dates_id: "r1", status: "accepted" }, [sit("r1", "in_progress")])).toBe(true);
    expect(applicationIsLive({ sit_dates_id: "r1", status: "accepted" }, [sit("r1", "cancelled")])).toBe(false);
    // The sit moved to r2 and the application was left behind on r1.
    expect(applicationIsLive({ sit_dates_id: "r1", status: "accepted" }, [sit("r2", "confirmed")])).toBe(false);
  });
  it("withdrawn, declined and cancelled have ended", () => {
    for (const status of ["withdrawn", "declined", "cancelled"]) {
      expect(applicationIsLive({ sit_dates_id: "r1", status }, [sit("r1", "confirmed")])).toBe(false);
    }
  });
});

describe("the invite sheet after an application ends (F1e)", () => {
  it("an applied invitation whose application was cancelled is invitable again", () => {
    const apps = [{ sit_dates_id: "r1", status: "cancelled" }];
    const live = liveApplicationRanges(apps, [sit("r1", "cancelled")]);
    expect(rangeInviteState(["applied"], live.has("r1"))).toBeNull();
    expect(invitableRanges(["r1"], [{ sit_dates_id: "r1", status: "applied" }], live)).toEqual(["r1"]);
  });
  it("a live application locks the range even with no invitation (the Nomad applied)", () => {
    const live = liveApplicationRanges([{ sit_dates_id: "r2", status: "applied" }], []);
    expect(rangeInviteState([], live.has("r2"))).toBe("applied");
    expect(invitableRanges(["r2"], [], live)).toEqual([]);
  });
});
