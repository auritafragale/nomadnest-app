# Add "Take a Photo" camera option to Nomad check-in photos

## Goal
When a Nomad adds a photo to a daily check-in (Pets Fed, Meds Given, Walk Completed), they get two choices on mobile: **Take Photo** (opens the phone camera directly) or **Upload** (opens the photo library/files). On desktop, both buttons fall back to the normal file picker.

## Where this applies
1. **Inbox check-in sheet** — `src/components/inbox/CheckinSheet.tsx` (the pop-up Nomads use from the chat care bar)
2. **Sit detail page check-in card** — `src/pages/SitDetail.tsx` (currently uses the shared `ImageUpload` component)

## Changes
1. **CheckinSheet.tsx**
   - Replace the single "Add photo" button with two side-by-side options: "Take Photo" (camera icon) and "Upload" (upload icon).
   - Two hidden file inputs: one with `capture="environment"` (rear camera on phones), one without.
   - Both feed the same existing upload/validation logic (image-only, 5MB max, upload to storage). No change to how photos are saved or displayed.

2. **ImageUpload.tsx** (shared component)
   - Add an optional `allowCamera` prop (default off, so listing/avatar uploads are untouched).
   - When enabled, show a "Take Photo" tile next to the "Add Photo" tile using a second hidden input with `capture="environment"`, reusing the same upload pipeline.

3. **SitDetail.tsx**
   - Pass `allowCamera` to the check-in `ImageUpload` so the sit page matches the inbox experience.

## Notes
- `capture="environment"` is the standard HTML attribute; iOS Safari and Android Chrome both open the camera directly when it's present. No new libraries or permissions prompts beyond the browser's normal camera access.
- Scope is limited to Nomad check-in photos, as requested — listing photos, avatars, and ID verification uploads are unchanged.
