# Pre-Launch Verification: Test Every Flow, Then Fix

Goal: run the whole app end to end on a phone-sized screen and on desktop, with real throwaway accounts, and come back with a short list of what still blocks launch — fixing anything broken as it is found.

## Known outstanding item

WhatsApp OTP is built but switched off (both the frontend and backend flags are unset), so phone verification is SMS only until you approve a WhatsApp sender in Twilio. Not a launch blocker.

Everything else (payments, SMS OTP, ID verification, email, maps, push) is wired; this pass is about proving the flows actually work together, not adding services.

## Phase 1 — Live walkthrough with real test accounts

Driven in a real browser at 390px and desktop width, capturing screenshots plus console and network errors per step:

1. Splash / onboarding carousel / landing page, all sections and carousels
2. Sign up, then onboarding steps 1-6 for each role (Nomad, Pet Parent, Combined), including city autocomplete and avatar upload
3. Complete Profile, then the dashboard for each role
4. Membership tabs, expandable features, checkout entry and cancel return, founding-member code redemption, perks hub locked vs unlocked
5. Pet Parent: create listing wizard end to end, image upload, publish, edit, duplicate, reopen dates
6. Nomad: browse sits grid and filters, listing detail, apply, save, Find Nomads map and visibility toggle, City Chat
7. Messaging: send and receive, unread badge appears and clears, typing indicator, notifications bell
8. Reviews: complete a sit, both-side review with category sub-ratings, placeholders where there are no reviews
9. Settings: profile edits, pause profile, phone verification, ID upload, replay tour, sign out, delete account
10. Bottom nav on every authenticated route, legal and marketing pages, guided walkthrough for a first-time user

## Phase 2 — Backend checks

- Sign-up path: profile and role rows created for every role, and no trigger failure able to make sign-up error out
- Row-level rules and table permissions per table, checked against what the UI actually reads and writes
- Database linter and security scanner: triage every finding, fix real ones, record intentional ones
- Every server function: auth check, CORS, error handling, required secrets present, no raw 500s reaching the UI
- Stripe: live keys and webhook secret confirmed, membership status syncing on subscribe, cancel and payment failure, plus behaviour while a webhook is delayed
- Recent auth, database and function logs scanned for errors already happening

## Phase 3 — Robustness and polish

- Every data fetch handles loading, empty and error states
- No redirect loops or protected-content flashes between `/`, `/auth`, `/onboarding`, `/dashboard`
- Forms: validation, double-submit protection, oversized or unsupported uploads
- Third-party failure modes (maps, Stripe, email, push, ID checks) degrade instead of blanking a page
- Mobile detail pass: no horizontal overflow, tap targets at least 44px, nothing clipped, fixed nav never covering buttons, keyboard not hiding inputs
- Terminology consistency (Nomad / Pet Parent), dead links and buttons, typecheck, dependency vulnerability scan

## Phase 4 — Report

A findings list grouped as **Blockers** (break sign-up or a core flow), **Bugs**, **Hardening**, **Polish**.

- Blockers fixed immediately, each one called out
- Small, safe bugs and polish fixed in the same pass
- Anything larger or opinionated comes back to you first; data or permission changes come as a migration to approve

## Technical notes

- Playwright against the running preview, with console and network capture at each step
- Read-only database queries, linter, security scanner and logs for the backend side
- Throwaway accounts named `audit+...@`, listed at the end so you can delete them
- Independent areas run in parallel to keep this fast
