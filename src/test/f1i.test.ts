import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PHONE_MESSAGES, phoneHash, toE164 } from "../../supabase/functions/_shared/phone-rules";

const FUNCTIONS = join(__dirname, "..", "..", "supabase", "functions");

const allSources = (dir: string): { file: string; text: string }[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return allSources(path);
    return name.endsWith(".ts") ? [{ file: path.slice(FUNCTIONS.length + 1), text: readFileSync(path, "utf8") }] : [];
  });

describe("no Stripe customer or member is ever found by email (F1i)", () => {
  const sources = allSources(FUNCTIONS);

  it("scans the edge functions", () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it("never lists or searches Stripe customers by email", () => {
    const bad = sources.filter(({ text }) => /customers\.list\(\s*\{[^}]*\bemail\b/.test(text) || /customers\.search\([^)]*email/.test(text));
    expect(bad.map((b) => b.file)).toEqual([]);
  });

  it("never lets Stripe Checkout make a customer from an email", () => {
    const bad = sources.filter(({ text }) => /\bcustomer_email\s*:/.test(text));
    expect(bad.map((b) => b.file)).toEqual([]);
  });

  it("never matches a member to Stripe by email", () => {
    const stripeFiles = sources.filter(({ text }) => /stripe/i.test(text));
    const bad = stripeFiles.filter(({ text }) => /\.eq\(\s*["']email["']/.test(text));
    expect(bad.map((b) => b.file)).toEqual([]);
  });

  it("the shared lookup searches by metadata.user_id only", () => {
    const plans = sources.find((s) => s.file.replace(/\\/g, "/") === "_shared/stripe-plans.ts")!;
    expect(plans.text).toMatch(/metadata\['user_id'\]/);
    expect(plans.text).not.toMatch(/customerIdFor = async \([^)]*email/);
  });
});

describe("phone verification helpers (F1i)", () => {
  it("normalises numbers to E.164", () => {
    expect(toE164("+44 7534 640769")).toBe("+447534640769");
    expect(toE164("0044 (7534) 640-769")).toBe("+447534640769");
    expect(toE164("447534640769")).toBe("+447534640769");
    expect(toE164("12")).toBeNull();
    expect(toE164("+0 123 456 789")).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });

  it("hashes with a key: 64 hex, stable, never the number, different per key", async () => {
    const a = await phoneHash("+447534640769", "key-1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await phoneHash("+447534640769", "key-1")).toBe(a);
    expect(await phoneHash("+447534640769", "key-2")).not.toBe(a);
    expect(await phoneHash("+447534640760", "key-1")).not.toBe(a);
    expect(a).not.toContain("7534640769");
    await expect(phoneHash("+447534640769", "")).rejects.toThrow();
  });

  it("plain messages, with the limit wording as agreed", () => {
    expect(PHONE_MESSAGES.tooMany).toBe("Too many codes requested. Please try again later.");
    // Neutral: never says another account has the number.
    expect(PHONE_MESSAGES.unavailable).not.toMatch(/account|another|already/i);
  });
});
