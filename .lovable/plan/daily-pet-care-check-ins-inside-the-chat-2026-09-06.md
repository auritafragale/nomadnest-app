# Daily pet care check-ins, inside the chat

Right now the daily check-in buttons exist, but they are hidden on a sit page nobody visits, and the "your sit has started" reminder only fires once, overnight, when the sit flips to "in progress" — which is why neither of you saw it. This plan moves check-ins into the place you already use every day (the chat with the other person) and adds a real daily reminder.

## 1. Check-ins live in the chat

When a sit is currently happening between the two people in a conversation, the message box gains a small care bar just above where you type:

- Three tap-to-log buttons: **Fed**, **Meds**, **Walk** (Meds only appears when at least one pet on that home needs medication).
- Tapping one opens a compact sheet: optional short note, optional photo (camera or gallery on mobile), then **Send update**.
- The update posts as a normal message in the thread, styled as a soft care card (icon + label + time + note + photo), so the Pet Parent sees it in the conversation and in their unread badge and push/email notification, exactly like a message.
- A subtle line under the care bar shows today's progress: "Today: Fed ✓ · Walk ✓ · Meds –".

The Pet Parent sees the same care bar area replaced by a read-only "Today's care" strip, so they can tell at a glance what has happened today without scrolling.

## 2. Daily reminders that actually arrive

- A new scheduled job (runs hourly) looks at every sit in progress and, in the early evening (about 6pm) in the timezone where that sit's home is located, for any Nomad who has not posted a check-in yet that day, creates a notification: "Time for today's check-in for [home] — tap to log Fed, Meds and Walk." It links straight into the chat with the Pet Parent.
- One reminder per day maximum, nothing sent once that day's check-ins are done, and nothing on the first day if a check-in is already posted.
- The existing sit-started message is reworded to explain the daily routine and also links to the chat.
- Reminders also flow through push notifications for anyone who has them turned on, and the notification bell.
- A one-off pass sends today's reminder for the two sits already running (Clare's "Cute home with puppy" and Aurita's "Beautiful Chaos in Delhi").

## 3. Small supporting touches

- The active sit card on the dashboard gets a "Daily check-in" button that opens the same chat, so there are two obvious ways in.
- Pet Parents get a "Care log" link on the active sit that opens the full history (the existing sit page feed, tidied) with all photos.
- Photos in check-ins are compressed on upload so they send fast on poor holiday Wi-Fi.

## Technical notes

- No new tables: `sit_checkins` (kind, note, photo_url) and `notifications` already exist with the right rules; `useSitCheckins` already mirrors each check-in into the conversation and triggers the Pet Parent notification.
- New `CheckinBar` + `CheckinSheet` components rendered by `MessageThread`, driven by a new hook that resolves the active sit for a conversation (owner/sitter pair + listing) and today's check-ins.
- Message rendering in `MessageThread` detects check-in messages (structured prefix written by `useSitCheckins`) and renders the care card instead of raw text; the mirrored message body keeps a machine-readable marker so this is reliable rather than string-sniffing prose.
- Meds button visibility reads the listing's pets `requires_medication` flag.
- New edge function `sit-checkin-reminders` (service role) plus a `cron.schedule` entry that runs hourly so it can fire at ~6pm in each sit location's own timezone; a per-nomad-per-day guard means the reminder is sent at most once a day, mirroring the existing `review-reminders` job; it inserts notifications and calls `send-push-notification`.
- Photo upload reuses `ImageUpload`/the existing bucket and folder used by check-ins today.
- Verification: `npx tsgo --noEmit`, a mobile-width pass (393×852) posting a check-in from a live sit chat and confirming it appears for the other side, and a manual invoke of the reminder function checking exactly one notification per Nomad.
