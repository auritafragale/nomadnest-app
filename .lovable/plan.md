# Three Pet Parent fixes: listings card, dashboard, applications filters

## 1. My Listings card — use the wasted space
On each listing card, the closed/booked date rows and the Edit/View row currently start to the right of the photo, leaving an empty column under the image.

- The closed-dates section (grey date boxes) and the Edit/View action row move to the full width of the card, starting under the photo.
- Inside each grey date box, the "Reopen" button sits under the "booked" pill instead of beside it, so the dates stay readable on a narrow phone.

## 2. Remove the "Applications Received" card
The dashboard card that repeats a short list of applications is removed, since Pet Parents now reach everything through the "Applicants" button in the bottom navigation. Nothing else on the dashboard changes.

## 3. Applications page — compact filters with sit dates
- The three stacked dropdowns (sort, location, animal experience) are replaced by a single "Filters" button, styled like the one on Browse Sits, placed directly under the status tabs.
- Tapping it opens a bottom sheet with: sort order, where the Nomad is based, animal experience, and a new "Sit dates" choice listing every date range that has applications ("All dates" plus each range, e.g. "Sep 6 – Sep 7, 2026").
- A small coral dot on the Filters button shows when any filter is active; the sheet has Clear all and Apply.
- Choosing a date range shows only applications for that range.

## Technical notes
- `src/components/dashboard/OwnerListingCard.tsx`: move the Collapsible closed-dates block and the actions row out of the right-hand content column into a full-width block below the photo/content flex row; in each date row switch to a column layout so the Reopen button renders beneath the status badge.
- `src/pages/Dashboard.tsx`: delete the "Applications Received" `Card` block (lines ~524-573) and clean up now-unused imports/vars (`OwnerApplicationPreviewCard`, `pendingApplications`/`liveApplications` if unused elsewhere, `ArrowRight`, `ClipboardList`).
- New `src/components/applications/ApplicationFilterSheet.tsx` modelled on `src/components/mobile/FilterBottomSheet.tsx` (Drawer, draft state, Clear all/Apply) holding sortKey, placeKey, petFilter and sitDatesId.
- `src/pages/Applications.tsx`: replace the 3-column Select grid with the Filters button + sheet under the `Tabs`; derive date-range options from `applications` (unique `sit_dates_id` with formatted range) and add a `sitDatesId` filter to the existing client-side filter chain.
