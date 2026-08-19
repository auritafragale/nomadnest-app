import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://nomadnest.global";

type Meta = { title: string; description: string; noindex?: boolean };

const ROUTE_META: Record<string, Meta> = {
  "/": {
    title: "NomadNest: Free Pet Sitting & House Sitting",
    description:
      "NomadNest connects adventurous Nomads with Pet Parents who need trusted home and pet care. No money, no booking fees, just community.",
  },
  "/browse-sits": {
    title: "Browse House & Pet Sits Worldwide | NomadNest",
    description:
      "Find free stays around the world in exchange for looking after someone's pets. Filter sits by location, dates and animals.",
  },
  "/browse-sitters": {
    title: "Find Trusted Pet Sitters (Nomads) | NomadNest",
    description:
      "Browse verified Nomads ready to care for your pets and home while you travel. Read reviews and invite them to your sit.",
  },
  "/membership": {
    title: "Membership Plans & Pricing | NomadNest",
    description:
      "Join NomadNest as a Nomad, a Pet Parent, or both. One annual membership, unlimited sits, and no booking fees ever.",
  },
  "/how-it-works": {
    title: "How NomadNest Works | Pet Sitting Exchange",
    description:
      "See how the NomadNest exchange works: Pet Parents list their home, Nomads apply, and care is swapped for free accommodation.",
  },
  "/about": {
    title: "About NomadNest | Our Story",
    description:
      "NomadNest was founded by two women who love pets and people, building a global community built on trust, not booking fees.",
  },
  "/perks": {
    title: "Member Perks & Partner Discounts | NomadNest",
    description:
      "NomadNest members unlock exclusive partner deals on travel insurance, pet care, gear and coworking. Included with your annual membership.",
  },
  "/safety": {
    title: "Safety & Trust at NomadNest",
    description:
      "ID verification, reviews, reporting tools and clear community standards keep every NomadNest sit safe for pets, homes and members.",
  },
  "/faq": {
    title: "Frequently Asked Questions | NomadNest",
    description:
      "Answers about memberships, verification, sits, pets, and how the free care-for-accommodation exchange works on NomadNest.",
  },
  "/contact": {
    title: "Contact & Support | NomadNest",
    description:
      "Questions, safety concerns or feedback? Contact the NomadNest team and we'll reply within 24 to 48 hours.",
  },
  "/terms": {
    title: "Terms of Service | NomadNest",
    description:
      "The terms that govern membership and use of the NomadNest pet and house sitting exchange platform.",
  },
  "/privacy": {
    title: "Privacy Policy | NomadNest",
    description:
      "How NomadNest collects, uses and protects your personal data as a member of our global sitting community.",
  },
  "/cookies": {
    title: "Cookie Policy | NomadNest",
    description:
      "Which cookies and similar technologies NomadNest uses, why we use them, and how you can manage them.",
  },
  "/code-of-conduct": {
    title: "Community Standards | NomadNest",
    description:
      "The standards every Nomad and Pet Parent agrees to: honesty, reliability, care of pets and homes, privacy and respect.",
  },
  "/auth": {
    title: "Sign In or Join NomadNest",
    description: "Create your NomadNest account or sign in to manage your sits, messages and profile.",
    noindex: true,
  },
};

const FALLBACK: Meta = {
  title: "NomadNest: Free Pet Sitting & House Sitting",
  description:
    "NomadNest connects adventurous Nomads with Pet Parents who need trusted home and pet care. No money, just community.",
  noindex: true,
};

const RouteSeo = () => {
  const { pathname } = useLocation();
  const path = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const meta = ROUTE_META[path] ?? FALLBACK;
  const url = `${SITE_URL}${path === "/" ? "/" : path}`;

  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={url} />
      {meta.noindex && <meta name="robots" content="noindex" />}
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
    </Helmet>
  );
};

export default RouteSeo;
