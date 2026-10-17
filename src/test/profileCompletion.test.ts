import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// One member's rows, served the way Supabase would.
const db = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  owner: null as Record<string, unknown> | null,
  sitter: null as Record<string, unknown> | null,
  ownerError: null as { message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({ data: db.profile, error: null }),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "owner_profiles" ? { data: db.owner, error: db.ownerError } : { data: db.sitter, error: null },
        }),
      }),
    }),
  },
}));

import { fetchOwnerCompletion, fetchSitterCompletion } from "@/hooks/useProfileCompletion";
import { ownerCompletion, sitterCompletion } from "@/lib/profileCompletion";

const COMPLETE_PROFILE = { first_name: "Aurita", avatar_url: "https://x/a.jpg", city: "New Delhi", country: "India" };

// What each editor computes from its own copy of the same rows (its fallback
// while the shared hook loads; the hook itself is the same function).
const parentEditor = (p: typeof COMPLETE_PROFILE, bio: string) => ownerCompletion(p, { bio }).percent;
const nomadEditor = (p: typeof COMPLETE_PROFILE, s: Record<string, unknown>) => sitterCompletion(p, { ...p, ...s } as Parameters<typeof sitterCompletion>[1]).percent;

beforeEach(() => {
  db.profile = { ...COMPLETE_PROFILE };
  db.owner = null;
  db.sitter = null;
  db.ownerError = null;
});

describe("profile completeness: Dashboard and editors agree", () => {
  it("Pet Parent: a complete profile is 100% on both", async () => {
    db.owner = { bio: "We love our two dogs and the garden." };
    const dashboard = await fetchOwnerCompletion("u1");
    expect(dashboard.percent).toBe(100);
    expect(dashboard.percent).toBe(parentEditor(COMPLETE_PROFILE, "We love our two dogs and the garden."));
  });

  it("Pet Parent: a bio of only spaces is empty on both", async () => {
    db.owner = { bio: "   " };
    const dashboard = await fetchOwnerCompletion("u1");
    expect(dashboard.missing).toEqual(["a bio"]);
    expect(dashboard.percent).toBe(75);
    expect(parentEditor(COMPLETE_PROFILE, "   ")).toBe(75);
  });

  it("Nomad: same rows, same percent (10 checks)", async () => {
    const sitter = { headline: "Calm with cats", bio: "Ten years of dogs and cats.", pet_types: ["cats"], gallery: ["a.jpg"], experience_level: "experienced", languages: [], sit_style: "" };
    db.sitter = sitter;
    const dashboard = await fetchSitterCompletion("u1");
    expect(dashboard.percent).toBe(nomadEditor(COMPLETE_PROFILE, sitter));
    expect(dashboard.percent).toBe(70);
    expect(dashboard.missing).toEqual(["1 more photo", "the languages you speak", "your sit style"]);
    expect(dashboard.line).toBe("Add 1 more photo, the languages you speak and more");
  });

  it("Nomad: a fully filled profile is 100% on both", async () => {
    const sitter = {
      headline: "Calm with cats",
      bio: "Ten years of dogs and cats.",
      pet_types: ["cats", "dogs"],
      gallery: ["a.jpg", "b.jpg"],
      experience_level: "experienced",
      languages: ["English"],
      sit_style: "Home-based",
    };
    db.sitter = sitter;
    const dashboard = await fetchSitterCompletion("u1");
    expect(dashboard.percent).toBe(100);
    expect(dashboard.line).toBe("");
    expect(nomadEditor(COMPLETE_PROFILE, sitter)).toBe(100);
  });

  it("Combined: each side agrees with its own editor", async () => {
    const sitter = { headline: "Calm with cats", bio: " ", pet_types: [], gallery: ["a.jpg", "b.jpg"], experience_level: "expert", languages: ["English"], sit_style: "Home-based" };
    db.sitter = sitter;
    db.owner = { bio: "Two cats, one balcony." };
    const nomad = await fetchSitterCompletion("u1");
    const parent = await fetchOwnerCompletion("u1");
    expect(nomad.percent).toBe(nomadEditor(COMPLETE_PROFILE, sitter));
    expect(nomad.missing).toEqual(["a bio", "the pets you care for"]);
    expect(parent.percent).toBe(parentEditor(COMPLETE_PROFILE, "Two cats, one balcony."));
    expect(parent.percent).toBe(100);
  });

  it("a failed read is an error, never 'Add a bio'", async () => {
    db.owner = { bio: "Two cats." };
    db.ownerError = { message: "network" };
    await expect(fetchOwnerCompletion("u1")).rejects.toBeTruthy();
  });

  it("the Dashboard and both editors use the shared hooks", () => {
    const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
    const dashboard = read("pages/Dashboard.tsx");
    expect(dashboard).toContain("useSitterCompletion(");
    expect(dashboard).toContain("useOwnerCompletion(");
    expect(dashboard).not.toMatch(/from\("(owner|sitter)_profiles"\)/);
    for (const [file, hook] of [["pages/EditOwnerProfile.tsx", "useOwnerCompletion("], ["pages/EditSitterProfile.tsx", "useSitterCompletion("]]) {
      const src = read(file);
      expect(src, file).toContain(hook);
      expect(src, file).toContain("invalidateQueries({ queryKey: PROFILE_COMPLETION_KEY })");
      expect(src, file).not.toMatch(/done \/ checks\.length/);
    }
  });
});
