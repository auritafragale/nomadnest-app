# New Features: Trust, Safety & Retention (8 features)

Build all 8 features from the ideas doc, with the customised 3-strike private-flag escalation and redemption flow, and soft (admin-review-only) cancellation strikes. Paid memberships stay as they are. Terminology stays Nomad / Pet Parent throughout.

## Phase 1 — Review & Trust

### 1. Community Integrity Badge (asymmetric reviews)
- A new `review_windows` tracking table (one row per sit per party: submitted / expired) driven by the existing review window + `review-reminders` cron.
- When one party reviews and the other lets the 14-day window expire, the reviewer earns the **Community Integrity Badge**.
- Green checkmark badge shown next to the review count on Nomad and Pet Parent profiles and cards.

### 2. Recency-weighted ratings
- Reviews keep their submission date; rating aggregation weights reviews under 6 months at 1.5× vs reviews older than 12 months.
- Profile review sections get a sort dropdown: **Most Recent | Most Relevant**.

### 3. Binary review tags + private flags (custom 3-strike escalation)
- Add Yes/No toggles to the review form (stored as new boolean columns on `reviews`):
  - Nomad reviewing home: home clean? · pets as described? · undisclosed cameras?
  - Pet Parent reviewing nomad: home kept clean? · communication reliable?
- Quick-stats display on profiles ("100% of nomads reported this home was clean").
- A "No" on a safety/cleanliness question counts as a **private flag** in a new `private_listing_flags` table (per listing, per issue category, per sitter).

**Escalation (per listing, per issue category):**
- **Strike 1:** recorded internally. Nothing visible, no action.
- **Strike 2 (2nd independent flag, same issue):** automated backend email to the Pet Parent using exactly this copy (branded template, dynamic first name and issue category injected from the flag):

> Subject: An important update regarding your recent stay on NomadNest
>
> Hi [Host Name], We hope you are having a wonderful week! At NomadNest, our goal is to build a trusted, transparent community where both pet owners and sitters feel completely comfortable and aligned before a house sit begins. As part of our commitment to safety and quality, our community team loops in hosts whenever specific feedback patterns arise. Recently, two separate verified sitters privately shared that they encountered a few challenges during their stays regarding: [flagged category, e.g. Home Cleanliness / Undisclosed Cameras / Pet Behavioural Quirks]. We understand that every home is unique, and sometimes things simply get overlooked or miscommunicated! … Your profile and listing remain active and fully visible. However, if a third independent sitter highlights this exact same issue on a future stay, a temporary notification will be shown to future applicants so they can plan their trip accordingly. How to clear this step: If your very next sitter completes their stay and notes that everything went smoothly regarding this issue, your account returns to perfect baseline standing automatically. … please reply directly to this email. Warmly, The NomadNest Community Team

- **Strike 3 (3rd independent flag, same issue):** a **Community Warning Notification** activates on the listing — when a Nomad taps Apply, an in-app notice reads "Previous nomads have flagged this listing for [issue]." Nothing is shown publicly on the listing page itself.
- **Redemption:** if the next confirmed Nomad completes the stay without flagging the same issue, the Strike 3 notification clears automatically and the listing returns to good standing. The escalation counter for that category resets.

## Phase 2 — Safety & cancellation guardrails

### 4. Reliability Score (soft mode)
- New `reliability_score` on profiles, starting at 100%.
- Cancelling a confirmed sit within 14 days of the start date records a **cancellation strike** and lowers the score.
- After 2 strikes the account is flagged for **admin review only** (visible in the admin panel) — no automatic blocking or restriction.

### 5. Urgent Sit broadcast
- Cancelling a confirmed sit within 7 days of the start date flips the listing/date to **URGENT**.
- Urgent sits are pinned to the top of Browse Sits with an "Urgent Sit" badge, and an automated in-app + push alert goes to verified active Nomads within ~50 miles of the listing.

## Phase 3 — UX improvements

### 6. Pet-behaviour & home-capability filters
- New structured fields:
  - Pets: medication required (Y/N), separation-anxiety tolerance (none / 1–4h / 4–8h), reactive to other animals (Y/N).
  - Listing: remote location (Y/N), car needed (Y/N), heavy gardening (Y/N).
- Wired into listing creation/editing steps and as multi-select filters on Browse Sits.

### 7. Offline Welcome Guide
- New `welcome_guides` table per listing with card sections: Wi-Fi info, vet info, feeding schedule, emergency contacts.
- Pet Parent edits it from the listing; confirmed Nomads see a dedicated Welcome Guide screen that caches content client-side (localStorage) so it opens offline / in airplane mode.

### 8. Structured check-in updates
- New `sit_checkins` table; during an active sit the Nomad taps [🐾 Pets Fed] [💊 Meds Given] [🚶 Walk Completed], optionally with one photo, sending a timestamped update into the shared conversation/sit screen that the Pet Parent sees in their feed, plus an in-app notification.

## Technical notes
- One migration: new tables (`review_windows`, `private_listing_flags`, `cancellation_strikes`, `welcome_guides`, `sit_checkins`) each with GRANTs + RLS; new columns on `reviews`, `pets`, `listings`, `profiles` (reliability_score, integrity badge flag).
- Strike-2 email sent through the existing Resend-based notification pipeline with a new branded template; flag counting runs in a SECURITY DEFINER function triggered on review insert so users can't write flags directly.
- Urgent-sit alerts reuse the existing push + notifications infrastructure.
- Admin panel gains a "Flags & Strikes" view (private flags per listing, cancellation strikes per member).
- Typecheck + browser pass on review form, profile badges, filters, welcome guide offline read, and check-in widget.
