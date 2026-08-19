# Plan: Add info-icon help tooltips for new members

## Approach
Create one reusable component, `src/components/ui/HelpTooltip.tsx`, an info `(?)` icon that opens a small popover on **tap or hover** (uses the existing shadcn `Popover` so it works on mobile, not desktop-hover-only). It accepts `content: ReactNode` and an optional `label` for screen readers. Brand-styled: muted `Info` icon (lucide), coral focus ring, max ~260px wide, dismiss on outside tap.

Then place it at the points below, grouped by the new-member journey. Each tooltip is a single short sentence (one-liner) — not a paragraph — so it stays scannable.

## 1. Onboarding (`src/pages/Onboarding.tsx`)
- **Role choice** (Nomad / Pet Parent / Combined): explain each and that Combined lets you both sit and host.
- **Sit style** ("Do you usually sit as…"): what this tells families (e.g. couples traveling together).
- **Availability** ("I have dates" vs "I'm flexible"): explain the difference.
- **"Create a listing now" choice**: you can add it later from the dashboard.

## 2. Dashboard (`src/pages/Dashboard.tsx` + cards)
- **Active Role mode switcher**: switching changes which listings, applications, and invites you see.
- **Profile Completeness card**: a fuller profile gets more matches and trust.
- **Membership Status card**: your tier gates listing creation and invites.
- **Push notification banner**: enabling alerts you to new messages and applications instantly.

## 3. Membership page (`src/pages/Membership.tsx`)
- **Why a subscription** (header): NomadNest is a barter — free stays for free sitting; the membership covers running the platform, not the sit.
- **Each tier card**: what's included (listing/invites access).
- **Founding member code field**: what the code is and that it grants free lifetime Combined.

## 4. ID Verification (`src/pages/VerifyIdentity.tsx`)
- **Why verify** (intro): builds trust and shows verification badges on your profile.
- **Each badge type** (ID / Email / Phone): what it confirms.

## 5. Browse & matching
- **Two-way matching** (BrowseSits / BrowseSitters header): nomads apply to listings, pet parents invite nomads.
- **Location privacy** (listing cards / detail): exact address stays hidden until a sit is confirmed.
- **Verification badges** (first card view): what the ID/Email/Phone badges mean.

## 6. Create listing — Requirements step (`RequirementsStep.tsx`)
- **Nomad Requirements**: optional must-haves; selecting fewer gets more applicants.
- **House Rules**: shown to accepted nomads before the sit.
- **Home Care Tasks**: tasks beyond pet care you'd like covered.
- **Preferred Communication**: how often you'd like updates during the sit.

## 7. Reviews (`WriteReviewDialog.tsx` + profile cards)
- **Each sub-rating category** (Pet Care, Communication, Reliability, etc.): what each measures.
- **Review window**: reviews unlock only after a sit is marked completed; 14 days to leave one before auto-complete.
- **Two-way reviews**: both parties can review each other once unlocked.

## 8. Find Nomads (`FindNomads.tsx` + `NomadVisibilityBanner.tsx`)
- **Visibility toggle**: when visible, other nomads can find you on the community map; turning off hides you but keeps your data.

## 9. City Chat (`CityChat.tsx`)
- **What this is** (header): a local space to ask questions, share tips, and meet nomads in the same city.

## 10. Settings (`src/pages/Settings.tsx`)
- **Role & Access** section: explain the mode-aware buttons and dashboard shortcuts.
- **Profile pause/deactivate**: pausing hides you from search and matches but keeps your data and reviews.

## Notes
- Reuse the existing `Popover` + `Info` icon; no new deps.
- All copy follows existing terminology (Nomad / Pet Parent, "no booking fees", coral accents).
- Tooltips are progressive enhancement — no layout shifts, hidden state unchanged.
