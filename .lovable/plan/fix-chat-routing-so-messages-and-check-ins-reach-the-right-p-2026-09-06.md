# Fix chat routing so messages and check-ins reach the right person

## What is going wrong

Confirmed from the live data:

- Aurita's Delhi sit (Clare's home "Beautiful Chaos in Delhi") has **no chat thread of its own**. When she taps Message or Daily check-in from that sit, the code falls back to "any chat with this person, whatever the home" and lands her in the chat attached to **her own** listing "Cute home with a puppy".
- There are **two chat threads for the very same pair of people and the same home** ("Cute home with a puppy"), one created with the two people's roles the wrong way round. Aurita's care log went into one thread, Clare is looking at the other — so Clare never sees it.
- There are also several empty leftover threads with the same person, which is why the chat list shows repeated "Clare FOUNDER — No messages yet" rows.

## The fix

### 1. One thread per home and pair of people

- Give every home-related chat a single, predictable identity: the home's Pet Parent is always stored as the Pet Parent side, the Nomad always as the Nomad side, plus the home it belongs to. Person-to-person chats with no home keep one thread per pair.
- Add a shared helper used everywhere a chat is opened or created (Sits card, care log/check-in, listing page, profiles, invites), so no screen can invent a second thread or a role-swapped copy.
- Add database uniqueness so a duplicate thread for the same home and pair can never be created again.

### 2. Never fall back to the wrong home

- Remove the "any chat with this person" fallback. If a sit's chat doesn't exist yet, create it for that exact home and open it. Result: the Delhi sit gets its own thread, correctly with Clare.
- Every check-in Aurita posts is mirrored into that sit's thread, so Clare sees Fed / Meds / Walk in the Delhi chat.

### 3. Care bar shows the right sit and the right side

- The daily care strip in a chat resolves the sit strictly by that chat's home and the two people's actual roles for it, instead of trying both directions. So Aurita sees the tappable Fed/Meds/Walk bar only in chats where she is the Nomad, and the read-only "Today"/Care log view only where she is the Pet Parent.

### 4. Messaging rules kept explicit

- Pet Parent mode: can start chats with Nomads only.
- Nomad mode: can chat with a Pet Parent when there is a sit or application between them; Nomad-to-Nomad social contact stays in Nomads Near Me and City Chats.
- These checks live in the shared helper so all entry points behave the same.

### 5. Clean up the existing mess

- Merge the two "Cute home with a puppy" threads into the correct one (moving the messages across) and delete the role-swapped copy.
- Remove the empty duplicate person-to-person threads that clutter the chat list, keeping the one with history.

## Technical notes

- New `src/lib/conversations.ts` with `resolveConversationForSit()` / `resolveDirectConversation()`; `SitsCalendar.tsx` (`openConversation`), `useSitCheckins.ts` (mirror lookup), and other entry points call it instead of ad-hoc queries.
- `useActiveSitForConversation.ts`: drop the two-direction `or(...)` sit lookup; match `owner_user_id`/`sitter_user_id` to the canonical conversation roles and require `listing_id` equality; keep the "live today" date check.
- Migration: normalise role-swapped `conversations` rows against `listings.owner_user_id`, repoint `messages.conversation_id` for the merged pair, delete empty duplicates, then add a unique index on `(listing_id, owner_user_id, sitter_user_id)` and a partial unique index for `listing_id IS NULL` pairs.
- Verify afterwards in the preview: from Aurita's Nomad Sits card, Message and Daily check-in open a Delhi thread with Clare; posting Fed appears there; the Cute-home chat keeps its own history.
