import { describe, expect, it } from "vitest";
import { isPlaceholderHeadline, perkHeadline, tripMomentOf } from "@/hooks/usePerks";

describe("perk headlines (P1)", () => {
  it("shows the admin's headline when it is real", () => {
    expect(perkHeadline("$5 off")).toBe("$5 off");
    expect(perkHeadline("3 months free")).toBe("3 months free");
    expect(perkHeadline("Member price")).toBe("Member price");
  });
  it("falls back to Member discount when empty or a placeholder", () => {
    expect(perkHeadline(null)).toBe("Member discount");
    expect(perkHeadline("   ")).toBe("Member discount");
    expect(perkHeadline("Get $ OFF")).toBe("Member discount");
    expect(perkHeadline("£ off")).toBe("Member discount");
  });
  it("blocks a currency sign without an amount (the admin editor rule)", () => {
    expect(isPlaceholderHeadline("Get $ OFF")).toBe(true);
    expect(isPlaceholderHeadline("£ off")).toBe(true);
    expect(isPlaceholderHeadline("$5 off")).toBe(false);
    expect(isPlaceholderHeadline("£10 off")).toBe(false);
    expect(isPlaceholderHeadline("Member price")).toBe(false);
  });
  it("puts unknown trip moments on the road", () => {
    expect(tripMomentOf("before")).toBe("before");
    expect(tripMomentOf("sit")).toBe("sit");
    expect(tripMomentOf("road")).toBe("road");
    expect(tripMomentOf(null)).toBe("road");
  });
});
