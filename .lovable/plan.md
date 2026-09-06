# Fix Sits card buttons and dashboard card order

## 1. Sits card buttons (src/components/dashboard/SitsCalendar.tsx → SitCard)

**Deep-link "Message" and "Daily check-in" into the actual sit chat**

- Add a small helper hook (in `SitCard`) that, on click, looks up the conversation between the sit's owner and nomad:
  - Query `conversations` by `owner_user_id` + `sitter_user_id` (try both role directions, since invite conversations can be swapped) and `listing_id` from the sit when available.
  - If a conversation exists, navigate to `/inbox?conversation=<id>` — Inbox already supports this param and opens the thread directly.
  - If none exists yet, create it (same pattern as `useSitCheckins`) and then navigate; fall back to plain `/inbox` on any error.
- Apply this to both the **Message** pill and the **Daily check-in** pill, so both land inside the relevant conversation (the check-in bar is already shown inside the conversation).

**Button labels and layout**

- Rename "Message pet parent" / "Message nomad" to just **"Message"**, keeping the same pill width (full-width row, `flex-1` styling unchanged).
- Same layout for both modes: full-width **Message** pill on top, with **Daily check-in / Care log** and **Cancel** pills in the row beneath it.
  - Nomad mode: Message → Daily check-in + Cancel
  - Pet Parent mode: Message → Care log + Cancel (+ Complete Sit where applicable, kept in the same secondary row)

## 2. Dashboard card order (src/pages/Dashboard.tsx)

- **Nomad Mode:** move the `UpcomingPastSits` ("Sits") card from the bottom of the middle column to the top, above "My Applications".
- **Pet Parent Mode:** move the `UpcomingPastSits` ("Sits") card so it sits between "Your Stats" (end of left column) and "My Listings" — implemented as the first card in the middle column, which also gives the correct order when the columns stack on mobile.

## Technical notes

- No database or backend changes; conversation lookup/creation reuses existing tables and the pattern already proven in `useSitCheckins.ts`.
- `Inbox.tsx` already reads `?conversation=` and selects that thread, so no changes needed there.
- Verify on the preview: clicking Message / Daily check-in from a Sits card opens the correct conversation directly in both Nomad and Pet Parent modes.
