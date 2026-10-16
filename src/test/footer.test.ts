import { describe, expect, it } from "vitest";
import { footerMode, HELP_LINKS } from "@/lib/footer";

const APP_PAGES = [
  "/dashboard",
  "/perks",
  "/my-sits",
  "/sits/abc",
  "/browse-sits",
  "/browse-sitters",
  "/sitter/u1",
  "/owner/u1",
  "/inbox",
  "/city-chats",
  "/city-chat/r1",
  "/notifications",
  "/membership",
  "/settings",
  "/settings/help",
  "/applications",
  "/my-applications",
  "/invitations",
  "/listing/l1/welcome-guide",
  "/admin",
  "/admin/perks",
];
const PUBLIC_PAGES = ["/", "/about", "/how-it-works", "/contact", "/terms", "/privacy", "/cookies", "/faq", "/safety", "/s/token"];

describe("site footer on phones", () => {
  it("members on app pages: tablet and desktop only", () => {
    for (const path of APP_PAGES) expect(footerMode({ store: false, signedIn: true, path })).toBe("tablet-up");
  });

  it("visitors: everywhere, including Browse", () => {
    for (const path of [...APP_PAGES, ...PUBLIC_PAGES]) expect(footerMode({ store: false, signedIn: false, path })).toBe("everywhere");
  });

  it("public pages keep it for members too", () => {
    for (const path of PUBLIC_PAGES) expect(footerMode({ store: false, signedIn: true, path })).toBe("everywhere");
    expect(footerMode({ store: false, signedIn: true, path: "/about/" })).toBe("everywhere");
  });

  it("store apps: never", () => {
    for (const path of [...APP_PAGES, ...PUBLIC_PAGES]) {
      expect(footerMode({ store: true, signedIn: true, path })).toBe("none");
      expect(footerMode({ store: true, signedIn: false, path })).toBe("none");
    }
  });

  it("Contact, Terms and Privacy are offered where the footer is hidden", () => {
    expect(HELP_LINKS.map((l) => l.href)).toEqual(["/contact", "/terms", "/privacy"]);
  });
});
