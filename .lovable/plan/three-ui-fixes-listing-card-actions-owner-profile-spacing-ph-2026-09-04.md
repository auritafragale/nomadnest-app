# Three UI fixes: listing card actions, owner profile spacing, photo ratio

## 1. Edit button to the left
On the "My Listings" card, the Edit and View buttons sit together on the right. Move Edit to the left corner of that row (the red square in the screenshot), keeping View on the right.

## 2. Remove "1 listing" and add a count badge
On the Pet Parent public profile:
- Remove the "1 listing" line from the meta row under the name, and tighten the spacing so the About section moves up instead of leaving a gap.
- Add a small count badge next to the "Active Listings" card title (the red square in the screenshot), showing the number of listings.

## 3. Photo ratio 3:2
Change the profile photo gallery from square to a 3:2 (landscape) ratio, including the loading skeleton, so images are less cropped.

## Technical notes
- `src/components/dashboard/OwnerListingCard.tsx`: change the actions row to `justify-between` (Edit first, View last).
- `src/pages/OwnerDetail.tsx`: delete the listings-count block in the meta row; add a `Badge` with `listings.length` in the "Active Listings" `CardTitle`; remove the now-empty margin left behind.
- `src/pages/SitterDetail.tsx`: swap `aspect-square` for `aspect-[3/2]` on the gallery container and its skeleton, adjusting the width classes so the frame still fits mobile.
