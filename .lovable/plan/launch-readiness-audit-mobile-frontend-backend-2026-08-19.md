# Launch Readiness Audit: Mobile, Frontend, Backend

Goal: prove a brand-new member can sign up, onboard, subscribe, list, apply, message and review on a phone without hitting a dead end — then fix what breaks. Findings are grouped and reported; blockers get fixed as they are found.

## Phase 1 — Mobile-first walkthrough (390px)

Drive the running app in a real browser at phone width, capturing screenshots and console/network errors at each step:

1. Splash → onboarding carousel → landing page
2. Sign up (email/password) → onboarding steps 1-6 for each role (Nomad, Pet Parent, Combined)
3. Complete Profile → Dashboard per role
4. Membership tabs, feature dropdowns, checkout entry, cancel return, perks hub
5. Pet Parent: create listing wizard end to end, image upload, publish, edit
6. Nomad: browse sits (2-col grid), filters bottom sheet, listing detail, apply, save, Find Nomads map, City Chat
7. Inbox: send/receive, unread badge appears and clears, notifications bell
8. Settings: edits, pause profile, phone verification, ID upload, replay tour, sign out, delete account
9. Bottom nav on every authenticated route; legal/marketing pages

Checks per screen: no horizontal overflow, tap targets ≥44px, text not clipped, fixed nav never covers content or buttons, sheets/dialogs/maps usable one-handed, safe-area padding, keyboard doesn't hide inputs, images sized for mobile.

## Phase 2 — Backend check

- Sign-up path: confirm profile + role rows are created for every role and that no trigger failure can make sign-up error out.
- Row-level security: for each table, verify policies actually allow what the UI does and block what they shouldn't, and that table permissions were granted. Extra attention to the newest tables (perks, perk clicks, city chat, reports, ID verification, push subscriptions).
- Database linter + security scanner: triage every warning, fix the real ones, document the intentional ones.
- Every server function: auth check, CORS, error handling, required secrets present, no 500s leaking to the UI.
- Stripe: live-mode keys and webhook secret confirmed, membership status syncs on subscribe/cancel/payment failure, and the UI behaves if the webhook is delayed.
- Scan recent auth, database and function logs for errors already happening.

## Phase 3 — Frontend robustness

- Every data fetch handles loading, empty and error states instead of crashing on undefined.
- Route guards: no redirect loops between `/`, `/auth`, `/onboarding`, `/dashboard`; no protected content flashing.
- Forms: validation, double-submit protection, oversized/unsupported image uploads.
- Third-party failure modes (Maps, Stripe, Resend, push, Onfido) degrade gracefully when a key or permission is missing.
- Terminology consistency (Nomad / Pet Parent), broken links, dead buttons.
- Typecheck and dependency vulnerability scan.

## Phase 4 — Report and fix

Deliverable: a findings list grouped as **Blockers** (break sign-up or a core flow), **Bugs**, **Hardening**, **Polish**.

- Blockers: fixed immediately, each one called out.
- Bugs / hardening / polish: fixed in the same pass where the change is small and safe; anything larger or opinionated comes back to you first.
- Any change to data or permissions comes to you as a migration to approve.

## Technical notes

- Live testing via Playwright against the running preview at 390px and desktop widths, with console/network capture.
- Backend inspection via read-only queries, the linter, the security scanner and logs.
- Throwaway test accounts named `audit+...@` — listed at the end so you can delete them.
- Independent areas run in parallel to keep this fast.
