# Take Photo / Upload Photo for check-ins and chat messages

## Goal
Members on mobile get two choices when adding a photo: **Take Photo** (opens the phone camera directly) or **Upload** (opens the photo library/files). This applies to Nomad daily check-ins and to regular chat messages, so members can share photos inside any conversation. On desktop, both options fall back to the normal file picker.

## Where this applies
1. **Inbox check-in sheet** — `src/components/inbox/CheckinSheet.tsx`
2. **Sit detail page check-in card** — `src/pages/SitDetail.tsx`
3. **Chat message composer** — `src/components/inbox/MessageThread.tsx` (all conversations, both roles)

## Changes
1. **CheckinSheet.tsx**
   - Replace the single "Add photo" button with two options: "Take Photo" (camera icon) and "Upload" (upload icon).
   - Two hidden file inputs: one with `capture="environment"` (rear camera on phones), one without. Both feed the existing upload/validation logic (image-only, 5MB max). No change to how photos are saved or displayed.

2. **ImageUpload.tsx** (shared component)
   - Add an optional `allowCamera` prop (default off, so listing/avatar uploads are untouched).
   - When enabled, show a "Take Photo" tile next to "Add Photo" using a second hidden input with `capture="environment"`, reusing the same upload pipeline.

3. **SitDetail.tsx**
   - Pass `allowCamera` to the check-in `ImageUpload` so the sit page matches the inbox experience.

4. **Chat photos in MessageThread.tsx**
   - Add a photo button (camera/image icon) next to the message input, offering "Take Photo" and "Upload" (same two-input pattern). Photo uploads to the existing `listing-images` storage bucket under `chat-photos/`.
   - Send the photo as a message with a compact machine-readable marker body, e.g. `[[image]]{"url":"...","caption":"optional text"}` — same proven pattern already used for check-in cards (`[[checkin]]...`). The composer can include optional caption text typed with the photo.
   - Update the message renderer: when a body parses as an image marker, show the photo inside the bubble (tap to view full size via the existing lightbox pattern) with the caption below; otherwise render text as today. Read receipts, timestamps, and report behavior stay unchanged.
   - No database migration needed — `messages.body` is text and already carries structured markers.

## Notes
- `capture="environment"` is the standard HTML attribute; iOS Safari and Android Chrome open the camera directly when it's present. No new libraries; the browser handles camera permission.
- Listing photos, avatars, and ID verification uploads are unchanged.
- Photo messages are stored in the same conversation, so both parties see them in the thread and they respect existing RLS and report flows.
