# Round 5 audit fixes

Six items, each checked at 393px before it is called done.

## 1. Dashboard profile card — remove the info icon

The grey Membership box is gone but the "i" help tooltip that belonged to it is still rendered. Remove the HelpTooltip from the membership row in the member card so only name, badges, renewal text and Manage subscription remain.

## 2. Listing location: "Location required" when typing a city

Confirmed cause in code: the step only accepts a location when a Google suggestion is picked — typing "Dubai" leaves city/country empty, so validation fails. Suggestions can also silently fail if the Places request is rejected (the key is referrer-restricted, so nothing appears on non-production hosts).

Fix so the field can never trap a member:
- If the member typed text but picked no suggestion, resolve it on blur/Next via Geocoding (existing `geocodeCityCountry`) and fill city, country, latitude, longitude from the result.
- Only show "Location required" when the text is empty or cannot be resolved at all, with a clearer message ("We couldn't find that place — try 'Dubai, United Arab Emirates'").
- Same behaviour in Create Listing and Edit Listing.
- Show a small "Searching…" / "No matches" state so the field never looks dead.

## 3. Pet Parent public profile spacing

- Make the verification pills smaller (tighter padding, smaller text, smaller icons) so ID / Email / Phone Verified fit on one line at 393px — verified in a real mobile session, not assumed.
- Keep the listing count on the reviews line (already done) and delete the leftover empty block between that row and About so the gap closes.
- Share icon stays with the profile image (already done) and is not duplicated in the action row.

## 4. Nomad profile photos and pet pills

- Replace the hero-plus-thumbnails gallery with the same swipeable gallery layout used on listing detail: one scrollable image area with arrows, a counter and tap-to-open full screen. No thumbnail strip.
- "Experienced with": show a maximum of 4 pills per row; when the nomad has more than 4 pet types, collapse the remainder behind a "+" dropdown.

## 5. Pet Parent dashboard: remove the Create Listing card

The "Create Listing" quick-action card in Pet Parent mode is redundant now that the button lives at the top of the dashboard. Remove the card (and its empty grid wrapper), keeping the top button as the single entry point.

## 6. My Listings card actions

Move Edit out of the thumbnail column: the thumbnail keeps only the image, and Edit sits on the same row as View, aligned to the bottom right of the card.

## Technical notes

- Files: `src/components/dashboard/MemberMembershipCard.tsx`, `src/components/listing/steps/HomeInfoStep.tsx`, `src/pages/CreateListing.tsx`, `src/pages/EditListing.tsx`, `src/components/maps/PlacesAutocompleteField.tsx`, `src/components/ui/VerificationBadges.tsx`, `src/pages/OwnerDetail.tsx`, `src/pages/SitterDetail.tsx`, `src/pages/Dashboard.tsx`, `src/components/dashboard/OwnerListingCard.tsx`.
- No database migration needed.
- Verification: `tsgo` typecheck plus a 393x852 browser pass over the dashboard card, Pet Parent profile header, Nomad profile gallery, and the My Listings card.
