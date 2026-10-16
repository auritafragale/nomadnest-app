/**
 * Where the site footer shows.
 * - Store apps: never (the menu and Settings carry Terms, Privacy and Contact).
 * - Signed-in members on app pages: tablet and desktop only; on phones the
 *   bottom bar and the menu are the navigation.
 * - Visitors, and everyone on public pages: everywhere.
 */
export type FooterMode = "everywhere" | "tablet-up" | "none";

/** Public pages keep the footer on phones even for signed-in members. */
export const PUBLIC_FOOTER_PATHS = [
  "/",
  "/about",
  "/how-it-works",
  "/contact",
  "/terms",
  "/privacy",
  "/cookies",
  "/code-of-conduct",
  "/faq",
  "/safety",
  "/auth",
  "/forgot-password",
  "/reset-password",
];

export const footerMode = ({ store, signedIn, path }: { store: boolean; signedIn: boolean; path: string }): FooterMode => {
  if (store) return "none";
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const isPublic = PUBLIC_FOOTER_PATHS.includes(clean) || clean.startsWith("/s/");
  return signedIn && !isPublic ? "tablet-up" : "everywhere";
};

/** Help and legal pages, reachable in two taps where the footer is hidden. */
export const HELP_LINKS = [
  { href: "/contact", label: "Contact us" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
] as const;
