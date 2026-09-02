# Founder Admin Panel + remaining launch items

## Why

The three admin screens already exist (`/admin/perks`, `/admin/verifications`, `/admin/emails`) but there is no link to them anywhere in the app — you have to type the URL. Each page also re-implements its own admin check, so behaviour drifts.

## What to build

### 1. Admin hub at `/admin`
A single dashboard for founders with:
- At-a-glance numbers: pending ID verifications, total members, active/founding members, published listings, open sit dates, perks live, founding-code spots left.
- Tiles linking to each admin tool: ID Verifications, Member Perks, Email Templates.
- Same coral/cream brand styling as the rest of the app, mobile-friendly.

### 2. Shared admin guard + layout
One `AdminRoute` wrapper that checks admin status once (via the existing secure admin check) and shows a single "Not authorised" screen. `/admin/perks`, `/admin/verifications`, `/admin/emails` all use it and drop their duplicated checks, plus a shared sub-nav so you can move between admin tools.

### 3. Discoverable entry point
- "Admin" link in the account dropdown in the navbar, shown only to admins.
- "Admin panel" shortcut in Settings for admins.

### 4. Small additions inside the hub
- Members list (name, email, role, membership status, verified badges) with search — read through an admin-only secure database function so it doesn't reopen the privacy lockdown.
- Founding-code usage counter (used / remaining).

## What else needs doing before/around launch

Already done: Stripe live checkout + webhook, membership lifecycle emails, branded email templates, privacy lockdown, edge function hardening, published to nomadnest.global.

Remaining, in order:
1. **Google Maps API key restrictions** — founder action in Google Cloud Console (restrict to nomadnest.global + preview domains, and to Maps JS/Places/Geocoding). Currently unrestricted, which risks quota abuse.
2. **Real listings** — announce to the Facebook community with the founding code so Pet Parents create genuine listings; no seeded fakes.
3. **Onfido** — still manual ID review; automated flow needs the Onfido webhook secret when you're ready.
4. **This admin panel** — so verifications, perks and emails are managed in one place.
5. Optional polish: a first real perk partner live, and a short in-app "how reviews work" note once the first sits complete.

## Technical notes

- New `src/pages/AdminHub.tsx`, `src/components/layout/AdminRoute.tsx`, `src/components/admin/AdminNav.tsx`; route `/admin` added in `App.tsx`.
- Stats read via a new admin-only `SECURITY DEFINER` function (e.g. `admin_dashboard_stats()`) that raises unless `is_admin_user(auth.uid())` — avoids granting broad column access.
- Members list via a new admin-only `admin_list_members()` function following the pattern of `admin_list_id_verifications()`.
- No changes to existing RLS/grants; no client-side admin flags.
