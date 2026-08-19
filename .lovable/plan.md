# Plan: Member Perks on Membership page + expandable feature explanations

## Goal
Make Member Perks a visible, integral benefit on the Membership page, and make every plan feature self-explanatory via expandable 2-line descriptions. Ensure each membership tier's full value is clearly listed.

## Scope
Frontend-only changes to `src/pages/Membership.tsx` and `src/hooks/useMembership.ts`. No database or backend changes.

## Changes

### 1. Add "Member Perks" to every plan's feature list
In `src/hooks/useMembership.ts`, append `"Member Perks & partner discounts"` to the `features` array of all three plans (Nomad, Pet Parent, Combined).

### 2. Make each feature an expandable dropdown with a 2-line explanation
Refactor the feature list in `Membership.tsx` from a static `<ul>` into a list of expandable rows. Each row:
- Shows the feature name + a chevron.
- Clicking expands a short (max 2 lines) plain-English explanation of what that feature actually gets you.

Add a `FEATURE_DESCRIPTIONS` map keyed by feature name (e.g. `"Unlimited sit applications"`, `"Member Perks & partner discounts"`, etc.) holding the explanation text for each. Features not in the map fall back to a generic line.

Curated descriptions to add (sample):
- `Unlimited sit applications` — "Apply to as many house-sits as you like, anywhere in the world. No caps, no per-application fees."
- `Profile with reviews` — "A public Nomad profile showing your verified badges, reviews from Pet Parents, and bio so families can trust you."
- `Find Nomads map` — "See other Nomads on an interactive map and connect with the community wherever you travel."
- `Community access` — "Join city chat rooms and talk to local Nomads and Pet Parents before you arrive."
- `Unlimited listing posts` — "List every home and pet you need sat. Manage multiple listings with no per-listing charge."
- `Manage applications` — "Review Nomad applicants, message them, and choose who stays — all in one place."
- `Map listing visibility` — "Your listings appear on the browse map with coral pins so Nomads can discover them."
- `Member Perks & partner discounts` — expandable with sub-list of perk categories (see below).
- `No booking fees ever` — "Sits are a barter — free accommodation for free pet care. You never pay a booking fee."
- `Best value` — "One membership covers both Nomad and Pet Parent access at a lower combined price."

### 3. Member Perks dropdown lists perk types
The "Member Perks & partner discounts" feature expands to show a short list of the partner categories members get access to, drawn from the real perk categories (`src/hooks/usePerks.ts` PERK_CATEGORIES) plus concrete examples the user named:
- Travel insurance
- eSIMs & connectivity
- Luggage storage
- Airport lounges
- Pet insurance & care
- Gear & tech
- Coworking & wellness

This row also links to `/perks` to browse live partners.

### 4. Review each tier for completeness
Audit the three plans' feature lists and add any missing core benefit so each tier's full value is represented:
- **Nomad** (£59): sit applications, profile+reviews, Find Nomads map, community, perks, no booking fees.
- **Pet Parent** (£59): listings, application management, map visibility, community, perks, no booking fees.
- **Combined** (£99): everything in both plans + best value + perks + no booking fees.

### 5. Keep the existing perks CTA
Leave the small "See Member Perks" link at the bottom of the page as-is (it now reinforces the feature-list mention). No removal needed.

## Out of scope
- Perks page itself (already built).
- Backend, RLS, or perk data.
- New routes.

## Verification
- Typecheck passes.
- Each plan card shows "Member Perks & partner discounts" as an expandable feature.
- Expanding Member Perks lists the category examples above and links to /perks.
- Every feature on every tier expands to a 2-line explanation.
