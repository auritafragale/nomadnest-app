# Always show the "Sit dates" filter

## Where it is
The sit date range picker already exists inside the **Filters** panel on the Applications page (`/applications`) — a "Sit dates" section with an "All dates" pill plus one pill per date range your Nomads applied to.

## Why you can't see it
The section is currently hidden unless your applications span **two or more different date ranges** (`dateOptions.length > 1`). Since your applications currently all fall under a single date range, the whole section is skipped and the sheet only shows Sort by, Where the Nomad is based, and Animal experience — matching your screenshot.

## Fix
Show the "Sit dates" section whenever there is **at least one** date range (change the condition from `> 1` to `>= 1`), so you always see it as soon as any application exists, even if there's only one range.

## Technical details
- One-line change in `src/components/applications/ApplicationFilterSheet.tsx`: `dateOptions.length > 1` → `dateOptions.length >= 1`.
- No changes to `Applications.tsx` — it already builds the options and applies the filter correctly.
