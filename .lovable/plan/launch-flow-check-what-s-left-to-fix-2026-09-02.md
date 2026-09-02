# Launch flow check: what's left to fix

I checked the live data and the security scan. The code is in good shape — most of what's left is leftover test data and a few small gaps that would make the app look broken to your first real members.

## 1. Leftover test data is still visible (highest impact)

- The only **published** listing is "Bangkok Apartment", which is set in Kraków, has **no photos**, and its only sit date is in the past (5–11 July). A visitor browsing sits today sees one broken-looking listing instead of your friendly empty state.
- The other two listings (Cozy Paris Apartment, London Sit) are drafts, but still test data.
- There are **no future open sit dates anywhere**, so the apply flow has nothing to act on.

Fix: unpublish/remove the test listings and their dates so Browse Sits shows the proper "marketplace is just opening" empty state until your Facebook community posts real homes.

## 2. City Chat rooms

15 rooms exist, all empty, and **Dubai is duplicated** (two identical rooms). Fix: remove the duplicate, add a uniqueness rule on city so duplicates can't be created again. Keep the rest — empty rooms are fine, members start the conversation.

## 3. Security scan findings — 2 are false alarms, 1 is intentional

- "Sitter/Owner phone numbers exposed" (2 errors): already fixed at the database level — reading `phone` as a normal member is denied. These need to be marked resolved so the publish flow stops blocking.
- "Security Definer View": this is the privacy wrapper (`public_profiles`) we built on purpose so visitors see name/city/badges without ever touching emails or phones. I'll document it and mark it as accepted.
- The two remaining warnings about SECURITY DEFINER functions are expected — those functions exist precisely to check permissions safely.

## 4. Small flow gaps worth closing

- **Stale sit dates**: nothing hides sit dates whose end date has passed. A listing with only past dates should not show as bookable in Browse. Add a filter so only future/open dates count, and flag it to the Pet Parent on their dashboard ("Add new dates").
- **Perks**: 4 partners are live (SafetyWing, Nomad eSIM, Stasher, GetYourGuide) but none is Featured, so the Perks hub has no hero card. Mark one or two as Featured.
- **Review reminders**: daily job is running and auto-completes finished sits — no change needed.

## 5. Founder actions (no code)

- Restrict the Google Maps API key by HTTP referrer (`https://nomadnest.global/*`, `https://*.lovable.app/*`) in Google Cloud Console.
- Announce to the Facebook group with the founding code `NOMADNEST2026FOUNDINGMEMBER` (998 spots left) so real listings arrive.

## Technical notes

- Migration: delete the 3 test listings (cascades pets/sit_dates/applications/sits for those records) or set them to `draft` + close dates; delete duplicate `city_chat_rooms` row and add a unique index on `city_key`.
- `useListings`/Browse query: require an associated `sit_dates` row with `status='open'` and `end_date >= current_date`.
- Owner dashboard listing card: show a "Dates expired — add new dates" state when no future open dates exist.
- Security findings resolved via the security finding management tools, not code.
