# Keep the check-in panel open after taking a photo

## Confirmed behavior in the current code

- “Take Photo” is a file input nested inside a clickable label.
- The whole background behind the panel closes the check-in on any click that reaches it.
- The panel itself stops ordinary clicks, but the camera input has no explicit protection against the event produced when the phone returns from its native camera.
- Upload and Take Photo already share the same upload function; the remaining failure is that the panel is dismissed before the camera photo can appear and expose the Send update action.

## Fix

- Replace the nested camera label interaction with an explicit camera button and hidden input reference.
- Only close the check-in when the user taps the backdrop itself or the close icon—not when a file-input/camera event bubbles through it.
- Keep the panel mounted while the camera photo uploads, then show the existing “Photo added” preview and visible “Send … update” button.
- Apply the same safe camera trigger pattern to the regular chat photo control, which currently uses a menu item and has produced the related ref warning.
- Preserve the existing 5 MB limit, image validation, storage location, and rule that the care pill turns green only after Send succeeds.

## Verification

- On a 393 × 852 mobile viewport, open Fed/Walk/Meds, tap Take Photo, return with a captured image, and confirm the panel remains open.
- Confirm the photo preview and Send update button appear above the bottom navigation.
- Press Send and confirm the panel closes only after success, the care pill turns green, and the check-in card appears in the correct chat.
- Confirm tapping outside or the close icon still dismisses the panel, while Upload continues to work unchanged.
