# Make daily check-ins actually reach the Pet Parent

## What the live data shows

- Only **one** check-in has ever been saved in the whole app: a "Pets Fed" posted by Clare on Aurita's "Cute home with a puppy" sit. That one worked end to end — Aurita got the alert and the card appeared in that chat.
- For Aurita's Delhi sit there is **no saved check-in at all**. So nothing was sent to Clare because nothing was ever recorded.
- Why nothing was recorded: the Fed / Walk / Meds pills do **not** post anything on tap, and there is no send button to confirm with — so a Nomad has no working way to record a check-in at all. That is exactly what the fix below changes.
- Second gap, confirmed in the data: when a check-in is saved, the Pet Parent gets an in-app alert only. There is no push or email for it, unlike a normal message, so Clare would not be pinged on her phone.

## The fix

### 1. One tap = posted

- Tapping Fed, Walk or Meds saves the check-in immediately and marks the pill green with a tick.
- A separate small "＋ note or photo" action opens the panel for anyone who wants to add a note or picture; the panel keeps its own send button.
- If saving fails, the pill returns to unticked and a clear message explains why, instead of failing quietly.

### 2. The check-in always lands in the right chat

- After saving, the care card is posted into that home's chat and both people's chat views refresh straight away, so the Nomad sees her own card appear and the Pet Parent sees it arrive live.
- If the chat card could not be posted for any reason, the Nomad is told, so a check-in never looks sent when the Pet Parent cannot see it.

### 3. The Pet Parent gets properly notified

- Each check-in also sends the Pet Parent a phone push and an email (respecting their notification settings), in the same style as a new message — not just the in-app bell.

### 4. The care log stays current

- The Pet Parent's "Today" strip and "Care log" refresh as check-ins come in, so the log matches the chat without reloading the page.

## Technical notes

- `CheckinBar.tsx`: pills call `useAddSitCheckin` directly (optimistic tick, revert on error); the sheet moves behind a secondary "note or photo" trigger. `CheckinSheet.tsx` keeps its submit path.
- `useSitCheckins.ts`: keep `resolveListingConversation` mirroring, but surface a warning toast when no conversation id resolves or the message insert errors; invalidate `["messages", id]`, `["conversations"]`, `["sit-checkins", sitId]`, and `["active-sit-for-conversation"]`.
- Push/email: after the mirrored message insert, call the existing `send-push-notification` and `send-notification-email` functions for the Pet Parent (guarded by `notification_preferences.email_sit_updates`), mirroring the pattern already used in `useConversations.sendMessage`.
- No schema change needed: `sit_checkins` insert policy and `trg_notify_owner_on_sit_checkin` are correct and verified working.
- Verification: from Aurita's Delhi sit chat, tap Fed and confirm a `sit_checkins` row, a `notifications` row for Clare, and the care card in conversation `04834eb6…`; then confirm Clare's care log shows it.
