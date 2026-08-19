# Member Perks: affiliate partner hub

Today the footer link "Member Perks" just points to `/membership` — there is no perks page. This plan builds a real members-only perks hub you can manage yourself, with automatic click tracking.

## What members see

New page at `/perks` (footer link updated to point there):

- Header: "Member Perks" + short line ("Exclusive partner deals for NomadNest members").
- Category filter chips: Travel, Insurance, Pet Care, Gear & Tech, Health & Wellness, Coworking, Other.
- Grid of perk cards, each with: partner logo, partner name, one-line benefit ("15% off pet travel insurance"), category tag, optional discount code (copy-to-clipboard button), and a "Get this perk" button.
- Featured perks pinned to the top row.
- Access rules:
  - Not logged in → teaser view (logos, partner name, benefit visible, blurred/locked codes and buttons) with a "Join to unlock" CTA to `/membership`.
  - Logged in without an active membership → same locked state with an upgrade CTA.
  - Active member (including founding members) → full access to links and codes.
- Legal/trust line at the bottom: "Some partner links earn NomadNest a commission at no extra cost to you — it helps keep membership fees low."

## How you add perks (admin)

New admin section at `/admin/perks` (same admin gate as `/admin/verifications`):

- Table of all perks with active/inactive toggle, featured toggle, drag-free sort order field, and click counts.
- Create/edit form: partner name, logo (upload to storage or paste URL), category, short benefit, longer description, affiliate URL, optional discount code, optional terms/expiry date, active, featured, sort order.
- Stats column shows total clicks and clicks in the last 30 days per perk, so you can see which partners perform without opening any affiliate dashboard.

## Click tracking with zero manual effort

Every perk button goes through our own redirect instead of straight to the partner:

```text
member clicks "Get this perk"
      -> /go/<perk-slug>  (edge function)
      -> writes one row to perk_clicks (perk, user, timestamp, referrer)
      -> 302 redirect to the affiliate URL (with any sub-ID appended)
```

Because the log happens in the redirect, tracking is fully automatic — nothing to tag or maintain per partner. Where a partner supports a sub-ID/tracking parameter, we append the member id (hashed) so conversions in their dashboard can be matched back to NomadNest members.

## Technical notes

Database (one migration):

- `perks`: name, slug, category, benefit_short, description, affiliate_url, logo_url, discount_code, terms, expires_at, is_active, is_featured, sort_order, subid_param.
- `perk_clicks`: perk_id, user_id (nullable), clicked_at, referrer.
- RLS: authenticated members can read active perks (codes and URLs served only to active members — the affiliate URL is never exposed to the client since redirection goes through the edge function); admins (`profiles.is_admin`) get full write access; `perk_clicks` insert only via edge function (service role), readable by admins only. GRANTs included for `authenticated` and `service_role`; `anon` gets read on a limited public view for the teaser (name, logo, benefit, category only).
- Aggregate view `perk_click_stats` for the admin totals.

Frontend:

- `src/pages/Perks.tsx`, `src/pages/AdminPerks.tsx`, `src/components/perks/PerkCard.tsx`, `src/hooks/usePerks.ts`, `src/hooks/useAdminPerks.ts`.
- Routes added in `src/App.tsx`; footer link changed from `/membership` to `/perks`; membership page gains a "See member perks" link as an extra selling point.
- Edge function `supabase/functions/perk-redirect/index.ts` handling `/functions/v1/perk-redirect?slug=...` (member session verified, click logged, 302 issued).
- Styling reuses existing coral/cream tokens, 14px radius, card patterns from listing cards; SEO title/description and JSON-LD ItemList on `/perks`.

## Suggested launch structure for content

Start with 6-10 partners across: travel insurance, pet insurance, flights/eSIM, pet gear, luggage, coworking/Wise-style banking. Each entry needs one clear number ("20% off", "£30 credit") — vague benefits convert poorly.
