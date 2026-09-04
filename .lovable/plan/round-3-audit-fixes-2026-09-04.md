# Round 3 audit fixes

Ten fixes from the third audit PDF, grouped by area. Mobile-first layout work plus one real bug (listing location search).

## 1. Pet Parent Dashboard — My Listings card (item 1)
- Rework `OwnerListingCard` for narrow screens: status badge + 3-dots menu move into the top-right of the thumbnail column area so nothing sits off-screen.
- "Edit" and "View" buttons move under the listing image.
- Remove the in-card "Create listing" entry point (it already lives at the top of the page).

## 2. Maps stay portrait on mobile (item 2)
- The listing/nomad map containers currently use a viewport-height class that flattens to landscape when zoomed out. Replace with a fixed portrait aspect ratio on mobile (`aspect-[3/4]`, min-height) and a fixed height from `sm:` upwards, so the frame never becomes wide-and-short.
- Keep rotate/tilt disabled.

## 3. Compact profile block on both dashboards (item 5)
- In `MemberMembershipCard`, move the "Combined Membership" and "Founding Member" badges directly under the member name as small inline chips.
- Delete the "Lifetime Access - no expiry" line.
- Tighten vertical padding/gaps so the card takes noticeably less space.

## 4. Listing location search not suggesting (item 6)
Confirmed cause: `PlacesAutocompleteField` waits for `window.google.maps.places` to already exist, and the Create/Edit Listing and Onboarding pages never load the Places script (no maps provider on those routes). So typing produces no predictions and the previously saved value stays.
- Make `PlacesAutocompleteField` load Places itself (same approach the search bars use: fetch the key, then load the Places library) before initialising its services.
- Once a prediction is picked, city/country/coordinates are written from that place, replacing any stale value.

## 5. Cancelled sits: cards, badges, text (item 7)
- Remove the "Cancelled Sits" card from the dashboard/profile sits view — cancelled items belong only in the Cancelled tab of Applications Received / My Applications.
- Fix the nomad Cancelled tab badge: it currently shows a blue "Pending" for cancelled rows; it must show the red/neutral "Cancelled" badge like the Pet Parent side.
- On the cancelled card, align the pet parent name left so it fits on one line.

## 6. Cancellation notification deep link (item 8)
- The in-app notification, on-screen toast and email for a cancelled sit all point at `/dashboard`. Change the link to the specific sit (dashboard sits view anchored to that sit id) so tapping any of the three lands on the cancelled sit.

## 7. Pet Parent public profile layout (item 9)
- "Founding member" badge moves next to the member name.
- The three verification badges fit on one line (smaller chips, wrap-safe row).
- "No reviews" moves next to the "1 Listing" stat instead of its own block.

## 8. Nomad mode — remove Saved Sits card (item 11)
- Delete the heart/Saved Sits quick-action card from the nomad dashboard; the entry point already exists at the top near sign-out.

## 9. Nomad public profile layout rebuild (item 12)
- Reduce the hero image height on mobile.
- Name on one line (truncate/scale), founding member badge next to the name.
- Verification badges wrap inside the screen.
- Location / reviews / experience / languages laid out as a two-line meta grid instead of one overflowing row.

## 10. Create Listing footer buttons (item 13)
- The "Previous" button becomes icon-only (back arrow) on mobile so "Save as Draft" and "Save" stay fully on screen.

## Technical notes
- Files: `src/components/dashboard/OwnerListingCard.tsx`, `MemberMembershipCard.tsx`, `src/components/dashboard/UpcomingPastSits.tsx`, `SitsCalendar.tsx`, `src/components/maps/ListingGoogleMap.tsx` + `NomadGoogleMap.tsx` + `SitterGoogleMap.tsx`, `src/components/maps/PlacesAutocompleteField.tsx`, `src/hooks/useSits.ts` (+ `supabase/functions/_shared/email-templates.ts` link), `src/pages/OwnerDetail.tsx`, `src/pages/SitterDetail.tsx`, `src/pages/Dashboard.tsx`, `src/pages/CreateListing.tsx`.
- No database migration expected; the cancellation link change is data written by existing insert code.
- Items 3, 4, 10 and 14 are absent from the PDF, so nothing is assumed for them.
- Verification: typecheck plus a mobile-viewport pass over dashboard, both public profiles, create-listing location field and footer, and the map pages.
