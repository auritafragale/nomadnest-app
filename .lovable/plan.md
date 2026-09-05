# Dashboard, pets, Welcome Guide & applications fixes

## Answer first: where is the sit date range picker?
It already exists in the **Filters** panel on the Applications page — a "Sit dates" group with "All dates" plus one option per date range. It is hidden unless applications span two or more different ranges, which is why your screenshot doesn't show it. This plan makes it appear whenever there is at least one date range.

## 1. Membership pills on one line
On the Dashboard welcome header, put the "Founding Member" pill and the membership pill ("Combined Membership") side by side on a single row: slightly smaller star pill, tighter padding, no wrapping on a 393px screen. Same header is used for both Nomad Mode and Pet Parent Mode, so one change covers both.

## 2. Pet cards open up
On a listing, each pet in "Meet the Pets" becomes tappable and opens a full pet view (dialog) with: photo gallery (swipe through all pet photos), name, type, age, personality, daily routine, feeding, walks/exercise, medication details, reactive-to-animals and separation-anxiety notes, and vet info. Keeps the existing tab strip for quick switching; tapping the pet row opens the detail.

## 3. Welcome Guide made findable
- Pet Parent dashboard: a new "Welcome Guide" card holding your single reusable guide — one guide per Pet Parent, editable any time, automatically attached to every listing you create now or later — with a status (Not started / Complete) and an Edit button that opens the guide editor for that listing.
- Nomad side: on the listing page for a sit you were accepted for, the Welcome Guide appears as the first card, above "About this sit", showing the guide content inline (WiFi, feeding, vet, emergency contacts, house notes).
- Offline + download: the guide is already cached on the device after first view; add a clear "Available offline" note and a Download button that saves it as a PDF/print sheet so it works with no signal.

## 4. "Your stats" card as tabs
Replace the stacked stat rows with a tab strip, each tab label carrying its count (e.g. "Active listings 1", "Draft 0", "Applications 2"). Selecting a tab shows a short line plus the link/action for that stat. Tabs scroll horizontally only on small screens. Applies to the Pet Parent stats card and the Nomad stats card.

## 5. Applications in date order
On the Applications page (Pet Parent) and in the "My Applications" section on the Nomad dashboard, the default order becomes earliest sit start date first, and each date group in the filter is listed chronologically. Existing sort options (most recent, most reviews, highest rating) remain available in the Filters panel.

## Technical notes
- `src/components/dashboard/DashboardHeader.tsx` — single flex row for `FoundingMemberBadge` + plan `Badge`, reduced text/padding, `flex-nowrap` with truncation.
- New `src/components/listing/PetDetailDialog.tsx`; wired into the pets section of `src/pages/ListingDetail.tsx` (fields already on `pets`).
- New `src/components/dashboard/OwnerWelcomeGuideCard.tsx` in `Dashboard.tsx` (owner column), using `useOwnerListings` + `useWelcomeGuide`.
- `ListingDetail.tsx`: render an inline read-only Welcome Guide block before "About this sit" when the viewer is the accepted sitter (or the owner); reuse `useWelcomeGuide` cache; add print/download via a print-styled view.
- Verify existing `welcome_guides` read access covers the accepted sitter; if not, add a read policy scoped to confirmed sits.
- New `src/components/dashboard/StatsTabsCard.tsx` (or in-place `Tabs`) replacing the stat lists in `Dashboard.tsx`.
- `src/pages/Applications.tsx`: default sort by `sit_dates.start_date` ascending; sort `dateOptions` chronologically.
- `src/components/applications/ApplicationFilterSheet.tsx`: show "Sit dates" when `dateOptions.length >= 1`.
