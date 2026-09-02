# Threaded City Chats + nearby city discovery

Bring City Chats closer to the Hostelworld model: questions become threads with reply counts and reactions. Access stays as it is today — members already get rooms from their profile location and from confirmed sit locations — with a "cities near me" list added purely as a faster way to find those rooms. Monetisation is documented only — nothing is charged in this build.

## 1. Reply threads

- Every message in a city chat can be opened as a thread.
- A message with replies shows a compact footer inside its bubble: up to 3 replier avatars + "8 replies" + a chevron, exactly like the reference.
- Tapping it opens a thread view (full-screen sheet on mobile, side panel on desktop) with the parent message pinned at the top, the replies below, and its own composer.
- Replies never appear in the main city feed — only the parent message with its reply count, so the room stays short and scannable.
- Realtime: new replies update the count in the feed live, and stream into an open thread view.

## 2. Reactions

- Long-press (mobile) or hover (desktop) a message to open a small emoji picker: heart, thumbs-up, laugh, fire, clap.
- Reactions render as a pill under the bubble with the emoji set and total count; your own reaction is highlighted and tapping it removes it.
- Works on both parent messages and replies. Realtime-synced.

## 3. Cities near me

- On the City Chats tab, add a "Near you" block above "Your City Chats".
- On first visit it asks permission for device location (with a clear one-line reason). If granted, it lists the closest city chat rooms with distance ("Chiang Mai · 12 km").
- If permission is denied or unavailable, it falls back to the city on your profile, and shows a link to Settings to change it — no dead end.
- Settings gets a "Chat location" row showing your current city with an edit action (uses the existing Places autocomplete field), so members can override without touching device permissions.
- Access rules do not change: joining still requires being a visible nomad based in the city or having a confirmed sit there within 7 days. The nearby list still shows locked rooms with the existing locked state.

## 4. Monetisation options (documented, not built)

Recorded for a later decision:

1. **Membership perk (status quo)** — City Chats remain included in the £59 / £99 annual plans. Simplest; no new Stripe objects, no extra checkout friction.
2. **City Pass add-on** — a separate paid pass (e.g. 30 days of city-chat access without a confirmed sit), sold as a new Stripe one-time price. Mirrors Hostelworld's Social Pass. Needs: a `city_passes` table (user, expiry), the pass check added to the access function, a paywall sheet on locked rooms, and webhook handling to grant the pass.
3. **Free preview, paid to post** — read the last few messages free, pay or subscribe to post and open threads. Best for conversion, but weakest for community warmth.
4. **Bundled with Perks** — position chat access as part of a higher "Nomad+" tier alongside partner perks, rather than a standalone purchase.

Recommendation: keep option 1 through launch (chat activity is what makes it valuable), and revisit option 2 once rooms have steady daily traffic.

## Technical notes

Database (one migration):
- `city_chat_messages`: add `parent_message_id uuid references city_chat_messages(id) on delete cascade`, plus indexes on `(room_id, parent_message_id, created_at)`.
- New `city_chat_message_reactions` (message_id, user_id, emoji, unique per triple) with GRANTs, RLS scoped to room access + `auth.uid()`, added to `supabase_realtime`.
- New `city_chat_thread_summaries` view (or an aggregate RPC) returning reply count and latest 3 replier avatars per parent, so the feed needs one query instead of N.
- Add `city_chat_messages` and the reactions table to the realtime publication if not already present.

Frontend:
- `src/pages/CityChat.tsx`: feed filters to `parent_message_id is null`; message bubble gains a thread footer and reaction row; new `CityChatThreadPanel` component for the thread view.
- New components under `src/components/city-chat/`: `MessageBubble`, `ThreadPanel`, `ReactionBar`, `NearbyCityChats`.
- New hooks: `useCityChatThread(parentId)`, `useMessageReactions(roomId)`, `useNearbyCityChats()` (geolocation + haversine against room coordinates).
- Rooms need coordinates for distance: reuse `src/lib/geocode.ts` to backfill lat/lng on `city_chat_rooms` (added in the same migration).
- `src/pages/Settings.tsx`: add the "Chat location" row using the existing `PlacesAutocompleteField`.
