# Fix the missing “Send update” button

## Confirmed cause

On a 393 × 852 phone viewport, the button exists but sits at `y=791–835`, while the fixed mobile navigation occupies `y=787–852`. Both layers currently use the same stacking level, and the navigation is rendered later, so it covers the button. A photo preview makes the panel taller and worsens the obstruction shown in the screenshot.

## Changes

- Keep the check-in panel above the mobile navigation.
- Limit the panel to the available screen height and make its content scroll when a photo increases its height.
- Keep the “Send update” action visible at the bottom of the panel, including with a photo attached and on shorter phones.
- Preserve the existing rule: the care pill turns green only after the update is successfully sent.

## Verification

- Test the exact `/inbox?conversation=...` check-in flow at 393 × 852.
- Open Fed/Walk/Meds, add a note, and confirm the send button is visible and tappable.
- Upload a photo and confirm the send button remains visible above the navigation.
- Submit and confirm the panel closes and the relevant pill turns green.
