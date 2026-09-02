# City Chats inside the Chats tab

Keep City Chats on the Find Nomads page exactly as they are, and additionally surface them in the bottom-nav "Chats" destination using the same pill switcher style as the Nomad Mode / Pet Parent Mode toggle.

## What changes

On the Chats page (`/inbox`):

- Add a segmented pill toggle under the page heading with two options:
  - **Messages** (icon: message circle) — the existing conversation list + thread, unchanged, shown by default.
  - **City Chats** (icon: map pin) — the existing City Chats content (Your City Chats + Explore City Chats search).
- Styling matches the existing mode switch: rounded-full track on a muted background, active segment filled coral with white text, inactive muted foreground, small icon + label.
- Selection is remembered in the URL (`?tab=city-chats`) so a shared/back-navigated link lands on the right view, and so opening a city chat and pressing back returns to the City Chats tab.
- If a conversation is deep-linked (`?conversation=…`), the Messages tab opens automatically.
- Page heading becomes "Chats" (the toggle labels the two views).

Nothing changes about who can access a city room — the existing access rules and Join Chat / locked states are reused as-is.

## Technical notes

- Extract the reusable parts of `src/components/city-chat/CityChatsSection.tsx` so it can render inside the Chats page without the outer page spacing (add an optional `variant`/`className` prop rather than duplicating the component). Find Nomads keeps using it unchanged.
- In `src/pages/Inbox.tsx`, add local tab state synced with `useSearchParams`, wrap the existing messages layout in the Messages branch, and render `CityChatsSection` in the City Chats branch.
- New small presentational component for the toggle (mirrors `src/components/mobile/MobileHomeScreen.tsx` styling) so it stays consistent with the mode switcher.
- No database, RLS, or hook changes.
