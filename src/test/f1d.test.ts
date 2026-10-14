import { describe, expect, it } from "vitest";
import { hasNewerLiveInvite, isLiveInviteConflict } from "@/lib/invites";
import { contentTypeFor, extensionFor } from "@/lib/idUpload";

// The bucket's allowed types (set in Lovable's Storage step for F1d).
const BUCKET_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

describe("undo a decline after a newer invitation (F1d)", () => {
  const declined = { id: "old", sit_dates_id: "r1", status: "declined" };
  it("hides Undo when the same range has a newer live invitation", () => {
    expect(hasNewerLiveInvite(declined, [declined, { id: "new", sit_dates_id: "r1", status: "pending" }])).toBe(true);
    expect(hasNewerLiveInvite(declined, [declined, { id: "new", sit_dates_id: "r1", status: "viewed" }])).toBe(true);
  });
  it("keeps Undo for other ranges, or when the newer one is no longer live", () => {
    expect(hasNewerLiveInvite(declined, [declined, { id: "new", sit_dates_id: "r2", status: "pending" }])).toBe(false);
    expect(hasNewerLiveInvite(declined, [declined, { id: "new", sit_dates_id: "r1", status: "declined" }])).toBe(false);
    expect(hasNewerLiveInvite(declined, [declined])).toBe(false);
  });
  it("recognises the database's one-live-invitation refusal", () => {
    expect(isLiveInviteConflict({ code: "23505", message: 'duplicate key value violates unique constraint "sitter_invites_one_live_per_range"' })).toBe(true);
    expect(isLiveInviteConflict({ code: "42501" })).toBe(false);
    expect(isLiveInviteConflict(null)).toBe(false);
  });
});

describe("ID uploads only use the bucket's allowed types (F1d)", () => {
  it("every content type the upload can send is allowed", () => {
    const names = ["a.jpg", "a.JPEG", "a.png", "a.webp", "a.heic", "a.HEIF", "a.pdf", "a.gif", "a.tiff", "a", "a.bmp"];
    const types = ["", "image/jpg", "image/jpeg", "image/png", "image/gif", "image/heic", "application/pdf", "application/octet-stream", "text/plain"];
    for (const n of names) for (const t of types) {
      const ct = contentTypeFor(n, t);
      if (ct !== null) expect(BUCKET_TYPES).toContain(ct);
    }
  });
  it("unknown files get no type (so they're refused, not sent)", () => {
    expect(contentTypeFor("a.gif", "image/gif")).toBeNull();
    expect(contentTypeFor("notes.txt", "text/plain")).toBeNull();
  });
  it("every allowed type has its own extension", () => {
    expect(BUCKET_TYPES.map(extensionFor)).toEqual(["jpg", "png", "webp", "heic", "heif", "pdf"]);
  });
});
