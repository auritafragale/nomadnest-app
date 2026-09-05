# Round 8 fixes

## 1. Dashboard: remove the membership card, badges on one line

- Remove the membership card block from the Dashboard in both Nomad and Pet Parent mode (the card showing "Combined Membership / Founding Member / Lifetime access"). Membership details stay on the Membership page, reachable from the header.
- In the header, keep "Founding Member" and the plan pill (e.g. "Combined Membership") side by side on the same line, directly under "Welcome back, Aurita!". They already sit together in the header markup, so this becomes the single place these statuses appear.

Result:

```text
[photo]  Welcome back, Aurita!
         [Founding Member] [Combined Membership]
         Dubai, United Arab Emirates  [eye]

[Saved Sits / + Create Listing] [Edit Profile] [gear]
```

## 2. Reports: show who was reported, link to their profile, require proof

**Admin Reports page**
- Show the reported member's name (as on their profile) instead of a raw ID, and make it a link that opens their full profile, so you can message them from there.
- For listing reports, show the listing title linking to the listing; for message reports, show the sender's name linking to their profile.
- Keep the existing status control (Pending / Reviewed / Resolved / Dismissed).

**Report email to founders**
- Add the reported member's name and a direct link to their profile, plus a link to the report in the admin panel.
- Include any uploaded proof as a link.

**Proof upload (mandatory)**
- Add a required file upload to the report dialog: members must attach at least one image or PDF as proof before Submit is enabled.
- Files go to a new private storage area for reports; only founders can view them (through a time-limited link generated on the admin page).
- Proof thumbnails/links appear on each report in the admin panel.

## Technical notes

- `Dashboard.tsx`: remove both `<MembershipStatusCard />` usages (lines ~313 and ~455) and its import; header badges in `DashboardHeader.tsx` already render on one line — no layout change needed beyond confirming wrap behaviour on small screens.
- Migration: add `evidence_paths text[]` to `public.reports`; extend `admin_list_reports()` to also return `target_name`, `target_profile_user_id`, and `evidence_paths` (resolving user/listing/message targets via joins). New private bucket `report-evidence` with policies: reporters may insert into their own folder, only `is_admin_user(auth.uid())` may select; admin page uses `createSignedUrl`.
- `ReportDialog.tsx` + `useReports.ts`: upload files to `report-evidence/{user_id}/{report_id}/...` before/after insert, store paths on the report, and block submit while no file is attached.
- `notify-new-report`: accept the reported user's name/id and evidence paths, HTML-escape all interpolated report text, and include profile + admin links.
