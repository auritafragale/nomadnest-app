# Round 6 fixes

## 1. One Save button on edit profile
On both Edit Nomad Profile and Edit Pet Parent Profile, remove the Save Changes button at the top of the page and keep only the one at the bottom, centred.

## 2. Nomad cards on Browse Nomads
- Show only the Founding Member star in the top-left corner of the card; remove the "Founding Member" pill (the full pill still shows on the profile page).
- Animal pills become icons only (no words), max 4 icons, with a "+" when the nomad has experience with more animals.

## 3. Upcoming / Past Sits as tabs
Replace the two stacked cards with a single card using switching tabs (same style as the Nomad / Pet Parent mode toggle), for both modes.

## 4. Notifications panel
- Tapping an accepted-application notification takes the Nomad to My Applications instead of the dashboard.
- Accepted titles show in green; cancellation titles show in red and read "Sit Cancelled".
Applies to both the desktop bell dropdown and the mobile notifications list.

## 5. Status tabs scroll sideways only
On My Applications (Nomad) and Applications (Pet Parent), the grey status tab strip scrolls left/right only, never up/down.

## 6. Nomad cards inside Applications
Same animal rule as item 2: icons only, max 4, then "+". The raw pet-group words (cats, dogs, small_pets…) are removed.

## 7. Location suggestions on browse search bars
Browse Nomads and Browse Sits search bars suggest locations after 3 typed characters, matching the listing-creation location field behaviour (they currently use a lighter suggestion input).

## Technical notes
- `EditSitterProfile.tsx` (line ~391) and `EditOwnerProfile.tsx` (line ~221): drop the header Save button; wrap the bottom one in a centred flex row.
- New shared `PetTypeIcons` component (icons only, cap 4, "+" overflow) used by `SitterGridCard.tsx`, `SitterCard.tsx` and `ApplicationCard.tsx` (replacing the `sitterProfile.pet_types` badge list at ~line 157). Remove `FoundingMemberBadge` pill from `SitterGridCard` and keep/position the star overlay top-left.
- `UpcomingPastSits.tsx`: single `Card` + `Tabs` with `TabsList grid grid-cols-2`, tab content reusing the existing lists.
- `NotificationsDropdown.tsx` + `MobileNotificationsSection.tsx`: route `application_status` with accepted status to `/applications`; derive a title colour class from type/status. Change insert title in `useSits.ts` (line 134) to "Sit Cancelled" and the email/push `pushTitle` in `_shared/email-templates.ts` to match.
- `Applications.tsx` (line 127) and the Nomad applications tab strip in `Dashboard.tsx` (~line 392): `overflow-x-auto overflow-y-hidden flex-nowrap` with `shrink-0` triggers.
- `LocationSearchInput.tsx` / `useCityPredictions.ts`: require 3 characters before requesting predictions and reuse the same Google Places session as the listing field, with the existing free-text fallback intact.
