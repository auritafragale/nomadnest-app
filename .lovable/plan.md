# App audit fixes (14 items)

All items from the audit PDF, grouped by area. Confirmed answers: build the 5-applicant round cap, auto-start sits with a daily backend job plus a live badge, and multi-date applications create one card per date range.

## Listing creation & editing

1. **Nomad Requirements** — remove "Background check", add "Solo traveller".
2. **Step navigation** — scroll to the top of the page whenever the step changes (Create Listing and Edit Listing).

## Listing detail page

3. **Meet the Pets** — replace the stacked cards with a tab bar of pet names (same segmented pill pattern used for Nomad / Pet Parent mode). One pet's details visible at a time.
4. **Pet age** — display "3 years old" / "0 years old" instead of a bare number, everywhere pet age is shown.
5. **Home Details / Requirements** — one segmented toggle with two tabs. "House Rules" and "Home Care Tasks" move inside the Home Details tab; Nomad Requirements stays in the Requirements tab.
6. **Ideal Nomad** — remove the section from the listing page (the field stays in the listing form data, just not displayed).
7. **Pet Parent card** — "ID Verified" and "Founding Member" badges sit side by side on one row.
8. **Remove "Message Owner"** from the pet parent card on the listing page. Messaging a pet parent only starts through a sit application.

## Applying for a sit

9. **Multi-date apply** — the apply dialog lists all open date ranges with checkboxes; a nomad picks any number and applies once. One application row is created per selected range, sharing the same message and highlights. Pet parents keep the existing per-range cards.
10. **Mandatory message** — "Message to the owner" is required; Submit stays disabled until it has content (short minimum length), with inline validation.

## Browse & filters

11. **Remove "Reason For Sit"** from the sit filters (mobile filter sheet and desktop filters).
12. **Founding Member badge on nomad cards** — smaller, single-line, no wrapping.

## Dashboard, applications & sits

13. **Auto-start sits** — a daily backend job moves confirmed sits into progress once the start date arrives and marks them completed after the end date. The UI also derives the state from today's date so the badge is correct immediately.
14. **Pet parent Upcoming Sits** — remove "Start Sit", replace with "Message nomad". Confirmed and current sits appear in the Applications section under the existing "Accepted" tab, with an extra "Current" badge. The "New" tab is removed.
15. **Nomad "My applications" panel** — the same panel layout pet parents have, with tabs: All, Accepted, Pending, Completed. Accepted items show "Accepted" and, when live, "Current".
16. **Nomad cancellation** — nomads can cancel a confirmed sit, with a mandatory message explaining why. The pet parent gets a notification.
17. **Pet parent cancellation** — mandatory cancellation message, notification to the nomad (currently not sent), and a prompt asking whether to reopen those dates on the listing.
18. **Application count reset** — the listing's application count reflects only live applications, so it returns to 0 when everyone in a round is declined, withdrawn or cancelled.
19. **5-applicant round cap** — each open date range accepts at most 5 active applications. Once 5 are in, further nomads see "This round is full". If all 5 are declined or cancelled without an acceptance, the range reopens for a new round.
20. **Your stats card** — nomad side: remove "Shortlisted", make each stat clickable through to the matching filtered view, and remove the "Messages" tile (Chats already lives in the nav). Pet parent side: keep the stats but make them clickable.

## Nomad profile pet types

21. Deduplicate the "Experienced with" list (`Dogs`/`Dog`, `Cats`/`Cat` etc. collapse to one), drop "Small pets" as an option, and give each pet type its own icon so dogs, cats, birds, fish, rabbits, exotics and farm animals no longer share the dog icon. Legacy stored values are normalised on read so Clare's profile stops showing a type she never picked.

## Technical notes

- **Database work:** a daily scheduled job (runs once per day, so a sit can show as started up to a day late in stored data — the UI compensates by deriving the state live) flipping `sits.status` between `confirmed` → `in_progress` → `completed`; an insert-time check enforcing the 5-active-applications-per-`sit_dates` cap; notification inserts on cancellation for both directions.
- **Frontend:** new shared segmented-tabs usage on `ListingDetail.tsx`; new nomad applications panel reusing `useSitterApplications`; a shared cancel dialog with required message; `formatPetType` extended with a canonical map plus per-type icons in `src/lib/petTypes.ts`.
- **Data cleanup:** normalise existing `sitter_profiles.pet_types` values to the canonical set and remove `small_pets`.
- Access rules, membership gating and review flows are unchanged.
