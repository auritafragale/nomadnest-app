# Six fixes: settings, dashboard, reporting, listing photos, city chats

## 1. Remove the "Role & Access" card
Remove the whole card from Settings in both modes.

Two useful controls live inside it today, so they move rather than disappear:
- For members with a single role, the "Expand Your Role" upgrade action moves into the card above (account details), so nobody loses the ability to become a Combined member. The profile-edit buttons stay out of Settings because they already live on the dashboard.

## 2. Welcome Guide pill placement (Pet Parent dashboard)
Move the "5/5 fields filled" pill up onto the same line as the "Welcome Guide" title, aligned to the right, and remove the duplicate pill from the body. The offline note and Edit guide button stay as they are.

## 3. Reporting flag everywhere
The flag already exists on Nomad and Pet Parent profiles and on message bubbles in private chats. Gaps to close:
- Add a flag in the chat header so a member can report the person they are talking to (works for Nomads and Pet Parents alike).
- Add a flag to city chat messages and thread replies, reporting that message and its sender.
- Keep the listing flag but surface it at the top of the listing page (next to the title/share row) instead of only far down the page.
Same dialog, reasons and evidence upload as today.

## 4. Listing photo header controls
On the fully opened listing page:
- Favourite heart in the top right corner of the photo, matching the browse card behaviour (only for signed-in members).
- Share moved to the top left corner of the photo as a plain icon over the image, with no outlined box, and removed from the title row.

## 5. Tappable listing photos
Tapping the main listing photo opens the existing full-screen photo viewer (swipe, arrows, keyboard, thumbnails) starting on the photo shown. Arrows, dots, heart and share keep working without triggering the viewer.

## 6. City chat access from a confirmed sit
Access is currently granted only while the sit is still marked "confirmed" and only within 7 days of the start date, which is why the Delhi chat disappeared once the sit started. Change the access rule to:
- Include sits that are confirmed or already in progress.
- Drop the 7-day window: access starts as soon as the sit is confirmed and lasts until the sit end date.

The room then shows under "Your City Chats" and stays joinable for the whole sit. Update the explanatory line under that heading to match the new rule.

## Technical notes
- `src/pages/Settings.tsx`: delete the Role & Access `Card`; relocate profile links + `UpgradeRoleDialog` into the account card; drop now-unused imports.
- `src/components/dashboard/OwnerWelcomeGuideCard.tsx`: pill into `CardTitle` row with `justify-between`.
- `src/components/inbox/MessageThread.tsx` (header flag), `src/components/city-chat/MessageBubble.tsx` and `ThreadPanel.tsx` (message flags), `src/pages/ListingDetail.tsx` (flag in header row) using existing `ReportDialog`.
- `src/pages/ListingDetail.tsx`: absolute-positioned heart via `useFavorites`/`useToggleFavorite`, share icon top-left (`ShareDialog` custom trigger), image click opens `PhotoLightbox` with `startIndex`.
- Migration: `CREATE OR REPLACE FUNCTION public.can_access_city_chat` — `s.status IN ('confirmed','in_progress')`, keep `sd.end_date >= CURRENT_DATE`, remove the `start_date <= CURRENT_DATE + 7 days` condition. No schema/grant changes needed.
- Copy update in `src/components/city-chat/CityChatsSection.tsx`.
