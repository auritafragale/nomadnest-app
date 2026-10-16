import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogoLinkLoader, LOGO_LINK_SECONDS } from "@/lib/perkLogoUrls";
import { checkLogoFile, logoFilesToDelete, perkLogoPath } from "@/lib/perkPlacements";

describe("perk logos are file names in perk-logos (P2b)", () => {
  it("accepts a plain file name", () => {
    expect(perkLogoPath("safetywing.png")).toBe("safetywing.png");
    expect(perkLogoPath(" nomad-esim-1760000000000.SVG ")).toBe("nomad-esim-1760000000000.SVG");
    expect(perkLogoPath("a_b.jpeg")).toBe("a_b.jpeg");
  });

  it("never shows web links, data: URLs, folders or odd names", () => {
    for (const v of [
      "https://safetywing.com/logo.png",
      "https://abc.supabase.co/storage/v1/object/public/perk-logos/x.png",
      "data:image/png;base64,AAAA",
      "../avatars/x.png",
      "folder/x.png",
      ".png",
      "x.png?token=1",
      "x.gif",
      "x.html",
      "",
      null,
      undefined,
    ]) {
      expect(perkLogoPath(v)).toBeNull();
    }
  });
});

describe("the uploader checks type and size first (P2b)", () => {
  it("takes PNG, WebP, SVG and JPG up to 512 KB", () => {
    expect(checkLogoFile({ name: "a.png", type: "image/png", size: 1000 })).toBeNull();
    expect(checkLogoFile({ name: "a.svg", type: "", size: 1000 })).toBeNull();
    expect(checkLogoFile({ name: "a.JPEG", type: "image/jpeg", size: 512 * 1024 })).toBeNull();
  });

  it("says plainly what's wrong", () => {
    expect(checkLogoFile({ name: "a.gif", type: "image/gif", size: 1000 })).toBe("Please choose a PNG, WebP, SVG or JPG file.");
    expect(checkLogoFile({ name: "a.png", type: "text/html", size: 1000 })).toBe("Please choose a PNG, WebP, SVG or JPG file.");
    expect(checkLogoFile({ name: "a.png", type: "image/png", size: 512 * 1024 + 1 })).toBe("That file is larger than 512 KB. Please choose a smaller one.");
  });
});

describe("old logo files are deleted (P2b)", () => {
  it("saved with a new logo: the old one and unused uploads go", () => {
    expect(logoFilesToDelete({ saved: "old.png", uploaded: ["a.png", "b.png"], final: "b.png" }).sort()).toEqual(["a.png", "old.png"]);
  });

  it("closed without saving: only this session's uploads go", () => {
    expect(logoFilesToDelete({ saved: "old.png", uploaded: ["a.png"], final: "old.png" })).toEqual(["a.png"]);
  });

  it("never touches a web link", () => {
    expect(logoFilesToDelete({ saved: "https://x.com/logo.png", uploaded: [], final: null })).toEqual([]);
  });
});

describe("signed links: one batch per screen, cached, refreshed (P2b)", () => {
  let t = 1_000_000;
  const now = () => t;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("signs every logo asked for at once in one call", async () => {
    const sign = vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `signed:${p}`])));
    const loader = createLogoLinkLoader(sign, now);
    const all = Promise.all(["a.png", "b.png", "a.png", "c.svg"].map((p) => loader.get(p)));
    await vi.runAllTimersAsync();
    const links = await all;
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign.mock.calls[0][0].sort()).toEqual(["a.png", "b.png", "c.svg"]);
    expect(links.map((l) => l.url)).toEqual(["signed:a.png", "signed:b.png", "signed:a.png", "signed:c.svg"]);
  });

  it("a logo that mounts while its batch is being signed waits for the same answer", async () => {
    let release: (v: Record<string, string | null>) => void = () => {};
    const sign = vi.fn((paths: string[]) => new Promise<Record<string, string | null>>((r) => (release = () => r(Object.fromEntries(paths.map((p) => [p, `signed:${p}`]))))));
    const loader = createLogoLinkLoader(sign, now);
    const first = loader.get("a.png");
    await vi.runAllTimersAsync();
    const later = loader.get("a.png");
    release({});
    await vi.runAllTimersAsync();
    expect((await first).url).toBe("signed:a.png");
    expect((await later).url).toBe("signed:a.png");
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it("keeps links in memory, then signs again before they expire", async () => {
    const sign = vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `signed:${p}:${t}`])));
    const loader = createLogoLinkLoader(sign, now);
    const first = loader.get("a.png");
    await vi.runAllTimersAsync();
    const link = await first;
    expect(loader.peek("a.png")?.url).toBe(link.url);
    expect(await loader.get("a.png")).toBe(link);
    expect(sign).toHaveBeenCalledTimes(1);
    // Signed again 5 minutes before the hour is up.
    expect(loader.refreshIn(link)).toBe((LOGO_LINK_SECONDS - 300) * 1000);
    t += (LOGO_LINK_SECONDS - 299) * 1000;
    expect(loader.peek("a.png")).toBeUndefined();
    const second = loader.get("a.png");
    await vi.runAllTimersAsync();
    expect((await second).url).not.toBe(link.url);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("a file that can't be signed, or a failed request, shows the tile", async () => {
    const loader = createLogoLinkLoader(async () => ({ "a.png": null }), now);
    const missing = loader.get("a.png");
    await vi.runAllTimersAsync();
    expect((await missing).url).toBeNull();
    const failing = createLogoLinkLoader(async () => {
      throw new Error("offline");
    }, now);
    const failed = failing.get("b.png");
    await vi.runAllTimersAsync();
    expect((await failed).url).toBeNull();
  });

  it("forget signs a fresh link after an image error", async () => {
    const sign = vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `signed:${p}`])));
    const loader = createLogoLinkLoader(sign, now);
    const a = loader.get("a.png");
    await vi.runAllTimersAsync();
    await a;
    loader.forget("a.png");
    const b = loader.get("a.png");
    await vi.runAllTimersAsync();
    await b;
    expect(sign).toHaveBeenCalledTimes(2);
  });
});
