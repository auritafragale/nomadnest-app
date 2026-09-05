# Download only the Welcome Guide from the listing page

## What happens now
On a listing page, the Download / Print button inside the Welcome Guide prints the whole page — photos, sit details and all — because nothing tells the printer which part to keep. On the full guide page it looks right only because that page contains just the guide.

## What you'll get
Tapping Download / Print inside the Welcome Guide on a listing prints only the guide: title, the filled sections (WiFi, feeding, vet, emergency contacts, house notes), and nothing else from the listing. Same clean sheet as the full guide page.

## How it works
- Add a small set of print rules to the app's global styles: when printing is triggered from the guide, everything on the page is hidden except the Welcome Guide block, which expands to full width with no card borders or shadows.
- The Welcome Guide block on the listing gets a marker class so the print rules can target it; the collapsible section is forced open for print, and the Offline badge, chevron, the Download button itself and the "Open full guide" link are hidden on paper.
- The full guide page keeps its current behaviour (it also picks up the same tidy print styling: navigation bar, footer and back link hidden).

## Technical notes
- `src/index.css`: new `@media print` block driven by a body-level class (e.g. `printing-guide`) toggled around `window.print()`, using `body.printing-guide *:not(...)` visibility approach or a `.print-only-root` isolation pattern; plus `.print-hidden` utility.
- `src/components/listing/InlineWelcomeGuide.tsx`: add `print-guide-root` to the Card, `print-hidden` to badge/chevron/buttons, force `open` state before printing, add/remove the body class around `window.print()` (with `onafterprint` cleanup).
- `src/pages/WelcomeGuidePage.tsx`: reuse the same helper so Navbar/Footer/back link are excluded.
- No database or data changes.
