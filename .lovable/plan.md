# Fix tab overflow & View docs placement on admin pages

## What you get

### Reports tabs — no more cropping

On the Reports admin page the tab row currently clips the first tab on the left (only half a red "0" pill shows) and the last tab "Dismissed" is cut to "Dis". This happens because the triggers use `flex-1`, which forces all four tabs to squeeze into the row width, and text overflows/crops.

Fix: each trigger keeps its natural width so nothing is compressed; the row scrolls horizontally only when needed. The first and last tabs will always be fully visible.

### Verifications tabs — horizontal scroll only

The Verifications tab row currently shows a vertical scrollbar thumb on the right because `overflow-x-auto` (per CSS spec) forces the Y axis to `auto` as well once one axis is not `visible`. 

Fix: lock the Y axis to hidden so the row only ever scrolls left-to-right, never up-and-down.

### Verifications — "View docs" sits under the status pill

In the Reviewed tab the "View docs" button is placed to the right of the "Approved" pill, and on mobile it overflows off the right edge of the screen.

Fix: on every verification card the status pill and the "View docs" button stack vertically (pill on top, button directly beneath), so the button stays on screen. The layout still works on wider screens.

## Technical notes

- Edit `src/pages/AdminReports.tsx` and `src/pages/AdminVerifications.tsx` only.
- **Reports (`AdminReports.tsx`)** — on the `TabsList`, replace `w-full flex overflow-x-auto mb-4` with `w-full flex overflow-x-auto overflow-y-hidden mb-4`. On each `TabsTrigger` replace `flex-1 capitalize gap-1.5` with `flex-shrink-0 capitalize gap-1.5 whitespace-nowrap`.
- **Verifications (`AdminVerifications.tsx`)** — same `TabsList`/`TabsTrigger` class fix: `overflow-x-auto overflow-y-hidden` on the list, `flex-shrink-0 gap-1.5 whitespace-nowrap` on triggers (drop `flex-1`).
- **Verifications `SubmissionCard` header** — change the right-hand cluster from a horizontal row to a vertical stack so "View docs" lands below the status pill. Replace `flex items-center gap-2` with `flex flex-col items-end gap-2` on that wrapping `div`.
- No database, RPC, or edge function changes.
