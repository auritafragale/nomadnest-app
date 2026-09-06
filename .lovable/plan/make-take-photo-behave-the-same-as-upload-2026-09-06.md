# Make "Take Photo" behave the same as "Upload"

## Root cause
Both the "Take Photo" and "Upload" pills feed the same `handlePhoto` function (in the check-in sheet and the chat composer). The handler rejects any file whose type doesn't start with `image/`. Photos picked from the gallery always carry a proper type, but photos coming straight from the phone camera often arrive with an empty or generic type and sometimes no file extension — so they get turned away with "Please select an image file" and nothing is added.

## Fix
Update the shared photo-handling logic in both places:

1. `src/components/inbox/CheckinSheet.tsx` (`handlePhoto`)
2. `src/components/inbox/MessageThread.tsx` (`handlePhotoFile`)

Changes:
- Accept the file when it has a proper image type **or** when the type is empty/generic (the input already limits selection to `image/*`, so the camera can't hand us a PDF).
- Derive the stored file extension safely: use the file name's extension when present, otherwise fall back to the MIME type, otherwise default to `jpg`.
- Keep the existing 5MB limit, upload path, preview, and send flow unchanged.

## Result
Taking a photo with the camera will show the same "Photo added ✓" state and preview as Upload, and "Send update" will work identically for both pills. No database or other code changes.

## Verification
Re-test the check-in sheet on a phone-sized viewport with a simulated camera-capture file (empty MIME type) to confirm it's accepted, previews, and the pill turns green after Send.
