import { afterEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_ID_EXTENSIONS, contentTypeFor, draftPath, extensionFor, prepareIdFile } from "@/lib/idUpload";

const U = "11111111-1111-4111-8111-111111111111";
const extOf = (path: string) => path.slice(path.lastIndexOf(".") + 1);

describe("ID uploads are saved with an allowed, lower-case extension (F1f)", () => {
  it("every content type the upload can send maps to an allowed extension", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]) {
      const ext = extOf(draftPath(U, "id", t, 1));
      expect(ALLOWED_ID_EXTENSIONS).toContain(ext);
      expect(ext).toBe(ext.toLowerCase());
    }
  });
  it("upper-case or odd file names still get a lower-case extension", () => {
    for (const [name, type] of [["IMG_0001.JPG", ""], ["scan.PDF", ""], ["Photo.HEIC", ""], ["a.jpeg", "image/jpg"]] as const) {
      const ct = contentTypeFor(name, type);
      expect(ct).not.toBeNull();
      expect(ALLOWED_ID_EXTENSIONS).toContain(extOf(draftPath(U, "selfie", ct!, 1)));
    }
  });
  it("the path is the member's own draft folder", () => {
    expect(draftPath(U, "id", "image/jpeg", 1760000000000)).toBe(`${U}/draft/id-1760000000000.jpg`);
    expect(draftPath(U, "selfie", "application/pdf", 5)).toBe(`${U}/draft/selfie-5.pdf`);
  });
  it("an unknown type never becomes an unknown extension", () => {
    expect(extensionFor("text/html")).toBe("jpg");
    expect(extensionFor("image/svg+xml")).toBe("jpg");
  });
});

describe("what prepareIdFile hands to the upload (F1f)", () => {
  afterEach(() => vi.unstubAllGlobals());

  // No decoder in the test environment, so photos go as they are: the
  // camera's JPEG, a chosen HEIC, a PDF. Each is typed from its name.
  it("camera photo, chosen photo and PDF all get an allowed type", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("Image", class { set src(_v: string) { setTimeout(() => (this as unknown as { onerror: () => void }).onerror(), 0); } });
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    const files = [
      new File([new Uint8Array([1, 2, 3])], "image.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([1, 2, 3])], "IMG_2001.HEIC", { type: "" }),
      new File([new Uint8Array([1, 2, 3])], "passport.pdf", { type: "application/pdf" }),
    ];
    for (const f of files) {
      const r = await prepareIdFile(f, true);
      expect("error" in r).toBe(false);
      if (!("error" in r)) expect(ALLOWED_ID_EXTENSIONS).toContain(extOf(draftPath(U, "id", r.contentType, 1)));
    }
  });
  it("an .html or .svg file is refused before upload", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("Image", class { set src(_v: string) { setTimeout(() => (this as unknown as { onerror: () => void }).onerror(), 0); } });
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    for (const f of [
      new File(["<html></html>"], "page.html", { type: "text/html" }),
      new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }),
    ]) {
      const r = await prepareIdFile(f, true);
      expect("error" in r).toBe(true);
    }
  });
});
