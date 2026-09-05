# Organise admin pages into tabs

## What you get

### Reports page

The Reports page in the founder admin gets four tabs across the top:

- Pending
- Reviewed
- Resolved
- Dismissed

Each tab shows only the reports with that status, and each tab label carries a count (for example "Pending 3"), so you can see at a glance what still needs attention. Pending opens by default.

When you change a report's status in its dropdown, the report immediately disappears from the tab you are looking at and appears under the matching tab, with the counts updating straight away and a short confirmation message. No page refresh needed.

If a tab is empty you get a friendly line such as "No resolved reports yet."

### Verifications page

The ID Verification Review page gets three tabs:

- Pending — submissions still awaiting a decision
- Reviewed — approved submissions
- Declined — rejected submissions

Each tab label carries a count, Pending opens by default, and when you approve or reject a submission it moves to the matching tab straight away (no reload). Empty tabs show a friendly line such as "No declined submissions yet."

## Details

- On mobile the tabs stay on one line with the counts as small pills, scrolling sideways if needed.
- Everything else on each report card and each verification card stays exactly as it is: reasons, reported member name/email/profile links, proof buttons, ID/selfie viewers, approve/reject actions.
- On Reports the status dropdown stays on the card as the way to move a report; the tabs are for viewing. On Verifications the existing Approve/Reject buttons move a submission between tabs.

## Technical notes

- Edit `src/pages/AdminReports.tsx` and `src/pages/AdminVerifications.tsx` only.
- On both pages add local state for the active tab plus a `useMemo` grouping of the list by status; wrap the list in the existing shadcn `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` components.
- Reports: reuse the existing `setStatus` handler — it already updates the local `reports` array, so regrouping is automatic; keep the report visible in its new tab rather than reloading from the server. Extract the current card markup into a small render helper so all four tabs share it.
- Verifications: reuse the existing `handleDecision`/`loadSubmissions` flow; after a decision the submission moves to its new tab automatically from the regrouped list. Verifications statuses are `pending`, `approved`, `rejected` — map them to the Pending / Reviewed / Declined tab labels.
- No database, RPC, or edge function changes.
