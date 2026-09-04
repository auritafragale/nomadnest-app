# Round 4 audit fixes

Five issues, fixed properly this time — each one checked in a real mobile-width browser session (393px) before it is called done, not just typechecked.

## 1. Dashboard membership/profile card

- Delete the grey "Membership" box from the Nomad and Pet Parent cards entirely.
- Beside the member's name: "Founding Member" badge (when applicable) and the plan badge (e.g. Combined Membership) directly under the name.
- Renewal date and "Manage Subscription" stay, but as plain inline text plus a link-style button — no bordered container.
- No membership plan? A single quiet "View Plans" link.

## 2. Create Listing location autocomplete (root cause fix)

The listing field uses its own prediction code path; the search bars that work use a different, proven one. Instead of patching again, the field will be rebuilt on the same working logic:

- Suggestions fire after 3 characters, debounced, with stale-response guarding.
- Place-type mapping fixed per field (city field vs. full-address field) so the request cannot be rejected for mixing incompatible types.
- Typing after a selection clears the previously stored city/country/latitude/longitude, so the "📍 Málaga, Spain (36.71…)" line can never stay behind when the text says Dubai; selecting a new place overwrites all four values.
- Verified live: open Create Listing, reach the Home step, type "Dub", confirm a Dubai suggestion appears, select it, and confirm the coordinates line updates.

## 3. Confirmed sit visibility, cancel, and scroll

Checked the database first: there is exactly one sit in the system (5–7 Sep, "Cute home with a puppy") and both it and its application are **cancelled**. So the "confirmed" Sep 5–6 sit in the screenshot is stale screen state, not live data.

- Confirm no cancelled sit renders anywhere as upcoming/confirmed for either party.
- Run a real end-to-end pass: create an application, accept it, confirm both parties see the sit under Upcoming Sits, and confirm either party can cancel it with a reason.
- Opening a sit scrolls the page to the top.

## 4. Pet Parent public profile

- ID Verified, Email Verified and Phone Verified all on one wrapping row (check the badge component itself, not just the container).
- Listing count moves next to the reviews / "No reviews yet" text.
- Share icon moves up next to the profile image instead of sitting with the action buttons.

## 5. Nomad public profile (mobile)

- Main photo gets sit-style left/right arrows and opens full-screen on tap (lightbox), thumbnails kept.
- Row 1: location + languages. Row 2: reviews + experience level.
- Report flag moves next to the name / Founding Member badge.
- Header spacing tightened so nothing overflows at 393px.

## Technical notes

- Files: `src/components/dashboard/MemberMembershipCard.tsx`, `src/components/maps/PlacesAutocompleteField.tsx` (aligned with `useCityPredictions` logic), `src/components/listing/steps/HomeInfoStep.tsx`, `src/pages/OwnerDetail.tsx`, `src/pages/SitterDetail.tsx`, `src/components/ui/VerificationBadges.tsx`, and the dashboard sit components (`SitsCalendar`, `UpcomingPastSits`, `Dashboard`).
- No database migration needed; sit/application data is already consistent.
- Verification: `tsgo` typecheck plus Playwright checks at 393×852 for the listing autocomplete, both profile headers, and the dashboard card.
