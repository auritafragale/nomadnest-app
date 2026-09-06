# Remove “Take Photo” and keep image uploads

## Goal
Remove the unreliable camera-capture option shown in the screenshots. Members will still be able to choose an existing image from their phone or computer and upload it.

## Changes
1. **Daily check-ins inside chat**
   - Remove the **Take Photo** button and camera-only file input.
   - Keep one full-width **Upload** option.
   - Preserve the existing upload progress, photo preview, remove action, 5MB limit, and **Send … update** button behavior.

2. **Regular chat messages**
   - Remove **Take Photo** from the image menu and remove its camera-only input.
   - Keep **Upload from Library** as the only image action, using the existing upload and message-send flow.

3. **Daily check-in card on the sit page**
   - Stop enabling the shared camera option so this check-in flow also shows only the normal image upload control.
   - Leave other uses of the shared image uploader unchanged.

## Verification
- Check the chat composer on a phone-sized screen: only the upload-from-library action is available and an uploaded image can be sent.
- Open Fed, Walk, and Meds Daily check-ins: only Upload is shown; an uploaded image previews correctly and **Send update** remains visible and works.
- Check the sit-page Daily check-in card: only the normal upload option is shown.
