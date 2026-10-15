import { describe, expect, it, vi } from "vitest";
import { escapeHtml, plainSubject } from "../../supabase/functions/_shared/escape";
import { submitApplicant } from "../../supabase/functions/_shared/onfido-rules";
import { createBlockFlow } from "@/lib/blockFlow";
import { detectStoreApp } from "@/lib/storeApp";
import { isQuietAuthError } from "@/lib/signInCheck";

describe("member text in emails is escaped (F1g)", () => {
  it("escapes markup, quotes and ampersands", () => {
    expect(escapeHtml(`<a href="x">Bob</a> & 'Co'`)).toBe("&lt;a href=&quot;x&quot;&gt;Bob&lt;/a&gt; &amp; &#39;Co&#39;");
    expect(escapeHtml("O'Brien")).toBe("O&#39;Brien");
  });
  it("subjects are one plain line, at most 120 characters", () => {
    expect(plainSubject("Reliability strike: Ann\r\nBcc: someone@example.com")).toBe("Reliability strike: Ann Bcc: someone@example.com");
    expect(plainSubject("a\u0000b\tc\u2028d")).toBe("a b c d");
    const long = plainSubject("x".repeat(300));
    expect(Array.from(long).length).toBe(120);
    expect(long.endsWith("…")).toBe(true);
    // Never cuts an emoji in half.
    expect(Array.from(plainSubject("🐾".repeat(200))).every((c) => c === "🐾" || c === "…")).toBe(true);
  });
});

describe("Onfido checks run on the caller's own applicant only (F1g)", () => {
  it("uses the caller's own applicant", () => {
    expect(submitApplicant(undefined, "own-1")).toEqual({ ok: true, applicantId: "own-1" });
    expect(submitApplicant("own-1", "own-1")).toEqual({ ok: true, applicantId: "own-1" });
  });
  it("refuses someone else's applicant", () => {
    expect(submitApplicant("someone-else", "own-1")).toEqual({ ok: false, reason: "not_allowed" });
    expect(submitApplicant("someone-else", null)).toEqual({ ok: false, reason: "not_allowed" });
  });
  it("needs an applicant of your own, and a string id", () => {
    expect(submitApplicant(undefined, null)).toEqual({ ok: false, reason: "bad_input" });
    expect(submitApplicant(42, "own-1")).toEqual({ ok: false, reason: "bad_input" });
  });
});

describe("Also report after a block (F1g)", () => {
  const setup = () => {
    const calls: string[] = [];
    const flow = createBlockFlow({
      refresh: () => calls.push("refresh"),
      onBlocked: () => calls.push("onBlocked"),
      openReport: () => calls.push("openReport"),
      onFinished: () => calls.push("finished"),
    });
    return { calls, flow };
  };
  it("opens the report sheet first; refreshes and moves on only after it closes", () => {
    const { calls, flow } = setup();
    flow.blocked(true);
    expect(calls).toEqual(["openReport"]);
    flow.reportClosed();
    expect(calls).toEqual(["openReport", "refresh", "onBlocked", "finished"]);
  });
  it("without Also report, refreshes and moves on straight away", () => {
    const { calls, flow } = setup();
    flow.blocked(false);
    expect(calls).toEqual(["refresh", "onBlocked", "finished"]);
  });
  it("closing the block sheet while the report is open doesn't end the flow early", () => {
    const { calls, flow } = setup();
    flow.blocked(true);
    flow.cancelled();
    expect(calls).toEqual(["openReport"]);
    flow.reportClosed();
    flow.reportClosed();
    expect(calls.filter((c) => c === "onBlocked")).toHaveLength(1);
  });
  it("cancelling without blocking does nothing but finish", () => {
    const { calls, flow } = setup();
    flow.cancelled();
    expect(calls).toEqual(["finished"]);
  });
  it("runs each step once, in order, in the profile, City Chat and private chat (same sheet)", () => {
    const onBlocked = vi.fn();
    const flow = createBlockFlow({ refresh: vi.fn(), onBlocked, openReport: vi.fn() });
    flow.blocked(true);
    expect(onBlocked).not.toHaveBeenCalled();
    flow.reportClosed();
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });
});

describe("store apps and quiet sign-in errors (F1g)", () => {
  it("detects the store apps", () => {
    expect(detectStoreApp({ capacitorNative: true })).toBe(true);
    expect(detectStoreApp({ referrer: "android-app://global.nomadnest.app" })).toBe(true);
    expect(detectStoreApp({ userAgent: "Mozilla/5.0 NomadNestApp/1.0" })).toBe(true);
    expect(detectStoreApp({ search: "?app=store" })).toBe(true);
    expect(detectStoreApp({ referrer: "https://google.com", userAgent: "Mozilla/5.0 Safari", search: "" })).toBe(false);
  });
  it("treats expired sessions and permission refusals quietly", () => {
    expect(isQuietAuthError({ code: "PGRST301", message: "JWT expired" })).toBe(true);
    expect(isQuietAuthError({ code: "42501", message: "permission denied for function get_my_verification" })).toBe(true);
    expect(isQuietAuthError({ status: 401 })).toBe(true);
    expect(isQuietAuthError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isQuietAuthError(null)).toBe(false);
  });
});
