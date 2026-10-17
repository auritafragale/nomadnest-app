import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PUSH_BAR_TEXT, shouldShowPushBar } from "@/lib/pushBar";

const base = { supported: true, loading: false, subscribed: false, permission: "default" as NotificationPermission, dismissed: false, signedIn: true, storeApp: false };

describe("Turn on notifications bar", () => {
  it("shows for a signed-in member on a device not set up yet", () => {
    expect(shouldShowPushBar(base)).toBe(true);
    expect(PUSH_BAR_TEXT).toBe("Turn on notifications on this device to get instant alerts for new messages, applications and invitations");
  });

  it("never while the check is running, once set up, when blocked, after dismissing, or in the store apps", () => {
    expect(shouldShowPushBar({ ...base, loading: true })).toBe(false);
    expect(shouldShowPushBar({ ...base, subscribed: true })).toBe(false);
    expect(shouldShowPushBar({ ...base, permission: "denied" })).toBe(false);
    expect(shouldShowPushBar({ ...base, dismissed: true })).toBe(false);
    expect(shouldShowPushBar({ ...base, storeApp: true })).toBe(false);
    expect(shouldShowPushBar({ ...base, supported: false })).toBe(false);
    expect(shouldShowPushBar({ ...base, signedIn: false })).toBe(false);
  });

  it("the check re-saves quietly and never treats 'no row' as an error", () => {
    const src = readFileSync(join(__dirname, "..", "hooks", "usePushNotifications.ts"), "utf8");
    expect(src).toContain(".maybeSingle()");
    expect(src).not.toContain(".single()");
    expect(src).toContain("upsert_push_subscription");
    expect(src).toMatch(/if \(!data\) await saveSubscription\(subscription\)/);
  });
});
