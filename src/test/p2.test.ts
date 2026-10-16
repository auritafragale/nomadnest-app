import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countdownLabel,
  daysUntil,
  isOurPerkLogo,
  monthKey,
  perksMonthStore,
  petNamesSentence,
  shortTitleFor,
  tripPassStore,
} from "@/lib/perkPlacements";

const BASE = "https://abc.supabase.co";
const OURS = `${BASE}/storage/v1/object/public/perk-logos/`;

describe("perk logos come from our own storage only (P2)", () => {
  it("shows a file in the perk-logos bucket", () => {
    expect(isOurPerkLogo(`${OURS}safetywing-1760000000000.png`, BASE)).toBe(true);
    expect(isOurPerkLogo(`${OURS}airalo.svg`, `${BASE}/`)).toBe(true);
  });

  it("never shows partner websites, data: URLs, other buckets or odd paths", () => {
    for (const url of [
      "https://safetywing.com/logo.png",
      "data:image/png;base64,AAAA",
      `${BASE}/storage/v1/object/public/avatars/x.png`,
      `${OURS}../avatars/x.png`,
      `${OURS}x.png?redirect=https://evil.example`,
      `${OURS}`,
      `https://abc.supabase.co.evil.example/storage/v1/object/public/perk-logos/x.png`,
      null,
      undefined,
      "",
    ]) {
      expect(isOurPerkLogo(url, BASE)).toBe(false);
    }
    expect(isOurPerkLogo(`${OURS}x.png`, undefined)).toBe(false);
  });
});

describe("short titles (P2)", () => {
  const perk = { name: "Airalo", short_title: "{country} data plan" };

  it("fills in the member's own sit", () => {
    expect(shortTitleFor(perk, { city: "Lisbon", country: "Portugal" })).toBe("Portugal data plan");
    expect(shortTitleFor({ name: "X", short_title: "Things to do in {city}" }, { city: "Lisbon" })).toBe("Things to do in Lisbon");
  });

  it("drops a missing place and capitalises", () => {
    expect(shortTitleFor(perk)).toBe("Data plan");
  });

  it("uses the perk name when empty", () => {
    expect(shortTitleFor({ name: "Airalo", short_title: "" })).toBe("Airalo");
    expect(shortTitleFor({ name: "Airalo", short_title: null })).toBe("Airalo");
    expect(shortTitleFor({ name: "Airalo", short_title: "{city}" })).toBe("Airalo");
  });
});

describe("Trip pass countdown and pets (P2)", () => {
  it("counts days to the start", () => {
    expect(daysUntil("2026-10-16", "2026-10-22")).toBe(6);
    expect(daysUntil("2026-10-16", "2026-10-17")).toBe(1);
    expect(daysUntil("2026-10-16", "2026-10-16")).toBe(0);
    expect(daysUntil("2026-10-16", "2026-10-15")).toBe(-1);
    expect(daysUntil("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("labels the pill", () => {
    expect(countdownLabel(6)).toBe("6 days to go");
    expect(countdownLabel(1)).toBe("Tomorrow");
    expect(countdownLabel(0)).toBe("Today");
  });

  it("joins first names", () => {
    expect(petNamesSentence([])).toBe("");
    expect(petNamesSentence(["Miso"])).toBe("Miso");
    expect(petNamesSentence(["Miso", " ", null, "Tofu"])).toBe("Miso and Tofu");
    expect(petNamesSentence(["Miso", "Tofu", "Bean"])).toBe("Miso, Tofu and Bean");
  });
});

describe("device-only stores (P2)", () => {
  let data: Record<string, string>;
  beforeEach(() => {
    data = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = String(v);
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("hides the pass and marks perks done per sit", () => {
    expect(tripPassStore.isHidden("s1")).toBe(false);
    tripPassStore.hide("s1");
    expect(tripPassStore.isHidden("s1")).toBe(true);
    expect(tripPassStore.isHidden("s2")).toBe(false);
    tripPassStore.markDone("s1", "p1");
    tripPassStore.markDone("s1", "p1");
    expect(tripPassStore.done("s1")).toEqual(["p1"]);
    expect(tripPassStore.done("s2")).toEqual([]);
  });

  it("ignores broken stored values", () => {
    data["nn_trip_pass_done:s1"] = "{not json";
    expect(tripPassStore.done("s1")).toEqual([]);
    data["nn_trip_pass_done:s1"] = JSON.stringify(["a", 3, null]);
    expect(tripPassStore.done("s1")).toEqual(["a"]);
  });

  it("shows 'New this month' until /perks is opened this month", () => {
    expect(perksMonthStore.seenThisMonth()).toBe(false);
    data.nn_perks_seen_month = "2000-01";
    expect(perksMonthStore.seenThisMonth()).toBe(false);
    perksMonthStore.markSeen();
    expect(data.nn_perks_seen_month).toBe(monthKey());
    expect(perksMonthStore.seenThisMonth()).toBe(true);
  });

  it("keeps working when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => tripPassStore.hide("s1")).not.toThrow();
    expect(tripPassStore.isHidden("s1")).toBe(false);
    expect(tripPassStore.done("s1")).toEqual([]);
    expect(perksMonthStore.seenThisMonth()).toBe(false);
  });
});

describe("perk-redirect stores the placement only (P2)", () => {
  const src = readFileSync(join(__dirname, "..", "..", "supabase", "functions", "perk-redirect", "index.ts"), "utf8");

  it("logs perk, member and placement, nothing else", () => {
    expect(src).toMatch(/\.insert\(\{ perk_id: perk\.id, user_id: user\.id, placement \}\)/);
    expect(src).not.toMatch(/referrer/);
  });

  it("accepts only the six placements", () => {
    for (const p of ["perks_page", "sit_confirmed", "sit_upcoming", "sit_now", "dashboard", "menu"]) expect(src).toContain(`"${p}"`);
    expect(src).toMatch(/PLACEMENTS\.has\(value\) \? value : "perks_page"/);
  });
});
