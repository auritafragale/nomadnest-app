# Full App Audit: Sign-up and Core Usage

Goal: prove that a brand-new person can sign up, onboard, subscribe, create a listing, apply, message, and review without hitting a dead end — then produce a prioritised fix list. This plan is audit-first: findings get reported before any behaviour changes, apart from clearly broken paths.

## Phase 1 — New user journey, tested live

Walk the real running app end to end in a browser, as a fresh account, and capture screenshots plus console/network errors at each step:

1. Landing page → Sign up (email/password) → email confirm behaviour
2. Onboarding steps 1–6 (all three role choices: Nomad, Pet Parent, Combined)
3. Post-onboarding redirect, Complete Profile flow
4. Dashboard for each role
5. Membership / paywall gating (checkout page reachable, cancel returns cleanly)
6. Pet Parent: create listing wizard, all steps, image upload, publish
7. Nomad: browse sits, apply, save, Nomads Near Me map, City Chat
8. Messaging: send, receive, unread badge clears, notifications bell
9. Settings: profile edits, pause profile, phone verification, ID verification upload, sign out
10. Legal/marketing pages and mobile bottom nav

This needs throwaway test accounts in the live backend. They will be clearly named (e.g. `audit+nomad@…`) and I will list them at the end so you can delete them.

## Phase 2 — Backend audit

- Confirm the sign-up trigger reliably creates the profile and role rows for every role, and that a failure inside it cannot block sign-up (a failing trigger makes sign-up return an error to the user).
- Verify every table's row-level rules actually allow the reads/writes the UI attempts, and block what they should. Row-level security is on for all 23 tables; the question is whether policies are correct and complete, and whether table permissions were granted.
- Check the newer tables (city chat, reports, manual ID verification, push subscriptions) which have the fewest policies.
- Review the database linter output: 18 warnings, mostly functions missing a fixed search path and privileged functions callable by anyone signed in (or not signed in). Decide which are intentional and fix the rest.
- Check every server function for: missing auth checks, missing CORS handling, unhandled errors returning 500s to the UI, and required secrets being absent.
- Review Stripe webhook handling and membership status sync, plus what happens if a payment succeeds but the webhook is delayed.
- Scan recent auth, database, and function logs for real errors already happening in production.

## Phase 3 — Frontend robustness audit

- Every data fetch: does the UI handle loading, empty, and error states, or does it crash on `undefined`?
- Route guards: no infinite redirect loops between `/`, `/auth`, `/onboarding`, `/dashboard`, and no protected content flashing before the check resolves.
- Forms: required-field validation, duplicate submits, oversized/unsupported image uploads.
- Mobile layout pass at 390px width for overflow and cut-off buttons.
- Third-party dependencies (Maps, Stripe, Resend, Onfido, push): confirm each fails gracefully when its key or permission is missing, so one outage never blanks a page.
- Dependency vulnerability scan.

## Phase 4 — Report and fix

Deliverable: a written findings list grouped as

- **Blockers** — break sign-up or a core flow for real users
- **Bugs** — wrong behaviour, degraded experience
- **Hardening** — security and resilience improvements
- **Polish** — copy, layout, consistency

I will fix blockers immediately as they are found (with each fix called out), and hold bugs/hardening/polish for your go-ahead so you stay in control of scope. Backend changes that alter data or permissions come to you as a migration to approve.

## Technical notes

- Live-app testing driven by Playwright against the running preview; screenshots and console/network capture per step.
- Backend inspection via read-only queries, the database linter, the security scanner, and auth/postgres/function logs.
- No schema changes in the audit phase unless a blocker requires one.
- Independent areas (backend audit, frontend audit, dependency scan) run in parallel to keep this fast.
