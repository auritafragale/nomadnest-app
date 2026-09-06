# Listing icons and reliable City Chat access

## 1. Plain image-overlay icons
- Remove the circular backgrounds, borders, blur and shadows surrounding the share and favourite controls on the fully opened listing image.
- Match the reference with larger, high-contrast icon strokes directly over the photo, while retaining an accessible tap area and labels.
- Keep the saved state visually distinct and preserve the existing share and favourite actions.

## 2. Restore Delhi City Chat now
- Create the missing Delhi, India room using the listing location and coordinates where available.
- Confirm Aurita’s current Delhi sit grants access and that Delhi appears under “Your City Chats.”

## 3. Make rooms automatic for every Nomad
- Add backend automation that creates or reuses the correctly normalized city room whenever a sit becomes confirmed or in progress.
- Backfill rooms for every existing confirmed/in-progress sit whose listing location currently has no room, so older and newer members are covered.
- Preserve the existing unique normalized city key so this cannot create duplicate city chats.
- Keep access available from confirmation through the sit end date for both confirmed and in-progress sits.

## Verification
- Check the listing controls on mobile against the supplied reference and confirm both actions still work.
- Test the live Delhi sit as Aurita and verify the room is visible and joinable.
- Query all current confirmed/in-progress sits to ensure none are missing a matching room, and verify duplicate normalized room keys remain at zero.

## Technical notes
- Update the listing image controls in `src/pages/ListingDetail.tsx`; extend `ShareDialog` only if needed to support a truly unframed trigger without changing its other uses.
- Add a database migration with an idempotent room-provisioning trigger and a one-time backfill from active sits/listings.
- The confirmed root cause is missing data: the Delhi sit is confirmed from 6–23 September 2026, but `city_chat_rooms` currently has no Delhi/India row. One of three active eligible sit locations is missing its room.
