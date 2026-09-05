# Organise safety reports into tabs

## What you get

The Reports page in the founder admin gets four tabs across the top:

- Pending
- Reviewed
- Resolved
- Dismissed

Each tab shows only the reports with that status, and each tab label carries a count (for example "Pending 3"), so you can see at a glance what still needs attention. Pending opens by default.

When you change a report's status in its dropdown, the report immediately disappears from the tab you are looking at and appears under the matching tab, with the counts updating straight away and a short confirmation message. No page refresh needed.

If a tab is empty you get a friendly line such as "No resolved reports yet."

## Details

- On mobile the tabs stay on one line with the counts as small pills, scrolling sideways if needed.
- Everything else on each report card stays exactly as it is: the reason, who reported it, the reported member's name and email linking to their profile, and the proof buttons.
- The status dropdown stays on the card as the way to move a report; the tabs are for viewing.

## Technical notes

- Edit `src/pages/AdminReports.tsx` only.
- Add local state for the active tab plus a `useMemo` grouping of `reports` by `status`; wrap the list in the existing shadcn `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` components.
- Reuse the existing `setStatus` handler — it already updates the local `reports` array, so regrouping is automatic; keep the report visible in its new tab rather than reloading from the server.
- Extract the current card markup into a small render helper so all four tabs share it.
- No database, RPC, or edge function changes.
