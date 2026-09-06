# Pet Parent chats without City Chats, plus a taller chat card

## What changes

1. Chats page (`/inbox`) hides City Chats in Pet Parent mode.
   - When the member is a Pet Parent (role `owner`), or a combined member currently in Pet Parent mode, the Messages / City Chats pill switcher is not rendered at all — they see the messages list and thread only.
   - If such a member lands on `/inbox?tab=city-chats` (old link or back navigation), it falls back to Messages.
   - Nomads and combined members in Nomad mode keep both tabs exactly as they are today.
   - Find Nomads keeps its City Chats section unchanged.

2. More room for the conversation card.
   - With the switcher hidden, the chat card grows into the freed space instead of leaving a gap.
   - The leftover strip at the bottom of the mobile chat view (visible above the bottom nav) is removed by making the card height derive from the actual header/toggle height rather than a fixed subtraction, so the message thread reaches the bottom nav in both modes.

## Technical notes

- `src/pages/Inbox.tsx`: read `role` from `useAuth()` and `activeRole` from `useActiveRole()`; compute `canUseCityChats = role !== "owner" && activeRole !== "owner"`. Gate both the toggle and the `city-chats` branch on it, and force `activeTab` to `messages` when it is false.
- Replace the fixed `h-[calc(100%-7rem)]` children with a flex column layout (`h-full flex flex-col`, header `shrink-0`, content `flex-1 min-h-0`), and tighten the mobile page height calc so no dead space remains under the composer.
- No database, hook, or messaging-logic changes.
