# Second audit round — fixes

## Mobile polish
1. **No pinch-zoom / locked portrait feel** — add `maximum-scale=1, user-scalable=no, viewport-fit=cover` to the viewport meta so the app behaves like a native app and maps can't be rotated into landscape by zooming.
2. **Pet Parent Dashboard layout** — content is touching the screen edges on mobile. Normalise the dashboard container padding, stat grid and card widths (no fixed widths, `min-w-0`, safe-area padding) so nothing overflows.
3. **Maps on mobile** — force a portrait-friendly aspect ratio and disable rotate/tilt gestures on the mini maps and the Nomads map, so the map always renders vertical.

## Navigation
4. **Profile tab (Nomad mode)** — the bottom-nav Profile icon currently goes to Settings; point it at `/dashboard`.

## Dashboard structure
5. **Merge membership + member card** — combine the Membership card and the "who you are" card into one compact card for both Nomad and Pet Parent modes.
6. **Header actions** —
   - Pet Parent mode: add `+ Create Listing` next to Sign out; remove the "Browse Nomads" quick-action card (already in the nav bar).
   - Nomad mode: add a Saved Sits (heart) action next to Sign out; remove the "Browse Sits" quick-action card.

## Listings
7. **Location search when creating/editing a listing** — the Home Info step uses the older Google Autocomplete widget, which is the one misbehaving. Swap both fields (city and private full address) to the same working autocomplete component used in onboarding/profile editing, with reliable typing, dropdown suggestions and geocoding.
8. **Short Notice badge** — recolour to fuchsia so it stands out on listing cards.

## Cancelled sits (items 7, 8, 9)
9. When a sit is cancelled:
   - the related application is moved out of the live states into a new **cancelled** application state (new value added to the application status list in the database),
   - it disappears from "Applications received" live counts,
   - the reopened dates no longer block the nomad from applying again (the "already applied" block is limited to live applications).
10. **Cancelled is not Past** — cancelled sits move out of "Past Sits" into their own **Cancelled** section on both dashboards (a sit that never happened is not history).
11. **Applications tabs** — add a **Cancelled** tab for nomads (My Applications) and make cancelled/declined sits appear correctly in the Pet Parent Declined/Cancelled tabs.
12. **Cancellation notifications** — the nomad must get in-app, on-screen and email notification when a pet parent cancels a confirmed sit (and vice-versa). In-app insert exists; add the email send and push, plus a toast for whoever is on screen via the existing realtime notification channel.

## Pet type icons
13. Farm Animal uses a horse-style icon and Reptile uses a snake-style icon, everywhere pet types are shown (listing form, listing detail, nomad profiles, filters, admin).

## Technical notes
- DB: one migration adding `cancelled` to the `application_status` enum, plus a trigger/update that sets affected applications to `cancelled` when a sit is cancelled.
- Frontend: `index.html` viewport, `Dashboard.tsx`, `MembershipStatusCard.tsx`, `BottomNav.tsx`, `HomeInfoStep.tsx` (switch to `PlacesAutocompleteField`), `ListingCard.tsx`, `UpcomingPastSits.tsx`, `SitsCalendar.tsx`, `Applications.tsx`, `useSits.ts`, `useSitterApplications.ts`, `useOwnerListings.ts`, `src/lib/petTypes.ts`.
- Cancellation email reuses the existing `send-notification-email` function; no new integrations.
- Item 12 in the PDF was empty, so nothing is planned for it.
