// @vitest-environment jsdom
/**
 * Store apps (App Store, Google Play): no membership price, no way to buy and
 * no link to pay outside the app. Every screen below is rendered as the store
 * app sees it and must show none of these; the web keeps them.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  store: true,
  membership: {} as Record<string, unknown>,
  access: null as null | { sitter: boolean; owner: boolean; pastDue: boolean; retryUntil: string | null },
}));

vi.mock("@/lib/storeApp", async (orig) => ({ ...(await orig<typeof import("@/lib/storeApp")>()), isStoreApp: () => env.store }));
vi.mock("@/components/layout/Navbar", () => ({ default: () => null }));
vi.mock("@/components/layout/Footer", () => ({ default: () => null }));
vi.mock("@/components/layout/Breadcrumbs", () => ({ default: () => null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("@/contexts/ActiveRoleContext", () => ({ useActiveRole: () => ({ activeRole: "sitter" }) }));
vi.mock("@/hooks/useFoundingSpots", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useFoundingSpots")>()),
  useFoundingSpots: () => ({ data: { spotsLeft: 989 } }),
}));
vi.mock("@/hooks/useSideAccess", () => ({ useSideAccess: () => ({ data: env.access }) }));
vi.mock("@/hooks/useMembership", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useMembership")>()),
  useMembership: () => env.membership,
}));
vi.mock("@/hooks/usePerks", async (orig) => ({
  ...(await orig<typeof import("@/hooks/usePerks")>()),
  usePerksPreview: () => ({ data: [{ id: "p1", name: "SafetyWing", logo_url: null, category: "Insurance", trip_moment: "before", sort_order: 1 }] }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const ok = async () => ({ data: null, error: null });
  const chain: Record<string, unknown> = new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : () => chain) });
  return {
    supabase: {
      rpc: ok,
      functions: { invoke: ok },
      from: () => chain,
      storage: { from: () => ({ createSignedUrls: ok }) },
      auth: { getSession: ok, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
      channel: () => chain,
      removeChannel: () => {},
    },
  };
});

import Membership from "@/pages/Membership";
import HowItWorks from "@/pages/HowItWorks";
import About from "@/pages/About";
import { ReadyToStart } from "@/components/landing/HomeSections";
import ListingStates from "@/components/listing/form/ListingStates";
import MembershipNotice from "@/components/membership/MembershipNotice";
import MembersOnlyNotice from "@/components/nn/MembersOnlyNotice";
import { MembershipPerksBlock } from "@/components/perks/Placements";

// Browser bits jsdom doesn't have.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;
window.scrollTo = () => {};

/** A membership price: £ followed by a number. */
const PRICE = /£\s?\d/;
/** Buy, upgrade, subscribe or pay actions, and founding-code redemption. */
const BUY = [
  /choose a plan/i,
  /continue with/i,
  /switch to (combined|nomad|pet parent)/i,
  /manage (billing|subscription)/i,
  /update my card/i,
  /keep my membership/i,
  /redeem/i,
  /invite code/i,
  /see membership/i,
  /view (membership )?plans/i,
  /check availability/i,
  /\brenew\b/i,
  /free trial/i,
  /secure payment/i,
];

const base = {
  loading: false,
  subscribed: false,
  status: "none",
  foundingMember: false,
  membershipType: null,
  cancelAtPeriodEnd: false,
  subscriptionEnd: null,
  cardBrand: null,
  cardLast4: null,
  pendingPlan: null,
  paymentFailedAt: null,
  checkSubscription: () => {},
  previewChange: async () => null,
  startCheckout: async () => {},
  confirmChange: async () => {},
  openPortal: async () => {},
  redeemFoundingMemberCode: async () => ({ result: "invalid" }),
  hasAccess: () => false,
};
const year = new Date(Date.now() + 200 * 86_400_000).toISOString();
const MEMBERSHIPS: Record<string, Record<string, unknown>> = {
  "not a member": base,
  "Nomad only": { ...base, subscribed: true, status: "active", membershipType: "sitter", subscriptionEnd: year, cardBrand: "visa", cardLast4: "4242" },
  "Pet Parent only, ending": { ...base, subscribed: true, status: "active", membershipType: "owner", subscriptionEnd: year, cancelAtPeriodEnd: true },
  "payment failed": { ...base, subscribed: true, status: "past_due", membershipType: "combined", paymentFailedAt: new Date().toISOString() },
};

const wrap = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{node}</MemoryRouter>
  </QueryClientProvider>
);

/** Everything a store reviewer could read or tap on this screen. */
const problems = (node: ReactNode) => {
  const { container } = render(wrap(node));
  const text = container.textContent ?? "";
  const found: string[] = [];
  const price = text.match(new RegExp(`.{0,30}${PRICE.source}.{0,10}`));
  if (price) found.push(`price: "${price[0]}"`);
  for (const re of BUY) {
    const hit = text.match(new RegExp(`.{0,20}${re.source}.{0,20}`, re.flags));
    if (hit) found.push(`buy action: "${hit[0]}"`);
  }
  container.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    if (/\/membership|checkout|stripe|billing/i.test(href)) found.push(`link: ${href}`);
  });
  return found;
};

const SCREENS: [string, () => ReactNode][] = [
  ...Object.entries(MEMBERSHIPS).map(([who, m]): [string, () => ReactNode] => [
    `Membership page (${who})`,
    () => {
      env.membership = m;
      return <Membership />;
    },
  ]),
  ["How it works", () => <HowItWorks />],
  ["About", () => <About />],
  ["Home: Ready to start", () => <ReadyToStart />],
  ["List your home: membership needed", () => <ListingStates state="membership" />],
  [
    "Dashboard notice: payment failed",
    () => {
      env.access = { sitter: true, owner: true, pastDue: true, retryUntil: null };
      return <MembershipNotice />;
    },
  ],
  [
    "Dashboard notice: Pet Parent membership ended",
    () => {
      env.access = { sitter: false, owner: false, pastDue: false, retryUntil: null };
      return <MembershipNotice hasPublishedListing />;
    },
  ],
  ["Members-only notice", () => <MembersOnlyNotice />],
  ["Membership perks block", () => <MembershipPerksBlock />],
];

afterEach(() => {
  cleanup();
  env.store = true;
});

describe("store apps show no price, no way to buy and no payment link", () => {
  for (const [name, screen] of SCREENS) {
    it(name, () => {
      env.store = true;
      expect(problems(screen())).toEqual([]);
    });
  }

  it("the check really catches them: the web still shows prices and buy actions", () => {
    env.store = false;
    const web = [problems((() => { env.membership = MEMBERSHIPS["Nomad only"]; return <Membership />; })())];
    cleanup();
    web.push(problems(<HowItWorks />));
    expect(web.every((p) => p.length > 0)).toBe(true);
    expect(web.flat().some((p) => p.startsWith("price"))).toBe(true);
  });
});

describe("every file that shows a price or a buy action checks for the store app", () => {
  const SRC = join(__dirname, "..");
  // Not shown to members: admin screens, a pattern used to block payment talk
  // in chat, and the code behind founding codes. Terms and Privacy are legal
  // text (renewal and refund terms), not buy actions.
  const SKIP = /^(test|integrations)\/|^pages\/Admin|^lib\/(chatSafety|foundingCode)|^hooks\/(usePerks|useMembership)|^pages\/(Privacy|Terms)/;
  /** What people can read: string literals and JSX text, not code names. */
  const visible = (s: string) => (s.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`|>[^<>{}]+</g) ?? []).join("\n");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p.slice(SRC.length + 1).replace(/\\/g, "/")] : [];
    });

  it("finds them", () => {
    const flagged = files(SRC)
      .filter((f) => !SKIP.test(f))
      .filter((f) => {
        const s = readFileSync(join(SRC, f), "utf8");
        const text = visible(s.replace(/^\s*(\/\/|\*).*$/gm, ""));
        return PRICE.test(text) || BUY.some((re) => re.test(text));
      });
    expect(flagged.length).toBeGreaterThan(5);
    const unguarded = flagged.filter((f) => !readFileSync(join(SRC, f), "utf8").includes("isStoreApp()"));
    expect(unguarded).toEqual([]);
  });
});
