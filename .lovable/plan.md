# Round 7 fixes

## 1. Remove the share icon from the Pet Parent profile
Drop the share button under the avatar on the Pet Parent profile page. Sharing stays on the listing page, which already links through to the Pet Parent's details.

## 2. Rebuild the top of the Dashboard (both modes)
Rearrange the header so it reads as one tidy block:

```text
[avatar]  Welcome back, Clare
          [Founding Member] [Membership]
          Adelaide, Australia  [eye = view profile]

[Saved Sits / + Create Listing]  [Edit Profile]  [gear]
```

- Small profile photo sits to the left of the "Welcome back" line.
- Founding Member and Membership pills move directly under that line (they move out of wherever they currently sit lower down).
- The "view profile" eye goes right after the location line.
- Action row keeps Saved Sits (Nomad mode) / + Create Listing (Pet Parent mode), gains an "Edit Profile" pill, then the settings gear.
- "Sign out" is removed from this row and lives in the top-right menu instead.

## 3. Pet Parent Mode navigation + applicant sorting
- In Pet Parent mode the bottom bar becomes: **Applicants** (goes to /applications) in the slot where Browse Nomads is, **Browse Nomads** in the slot where Sits was, then Chats and Dashboard. Nomad mode is unchanged.
- On the Applications page add a sort/filter control above the list:
  - Sort by: Most recent | Most reviews | Highest rating
  - Location: All | Local (same city/country as the listing) | International
  - Pet experience: filter to applicants whose profile lists the pet type of the listing (dogs, cats, senior/medical care where recorded)
- These work with the existing All / Shortlisted / Accepted / Declined / Cancelled tabs.

## 4. Strike 2 email for Nomads
The strike system already emails at the second independent flag, but both sides share one generic wording. Split it so Nomads get the exact copy supplied, with:
- Subject: "An important update regarding your recent stay with NomadNest"
- The Nomad's first name inserted
- The flagged category inserted as Home Cleanliness / Pet Care Protocol / Timeline Reliability
- "What happens next?" and "How to clear this step" sections as written
Pet Parents keep their existing wording. Sending stays driven by the daily job that watches the flag count, so a Nomad only ever gets it once per issue.

## 5. Reporting flow — current state and what to add
Today, when a member submits a report it is saved to the reports table and the reporter sees a thank-you message. Nothing else happens: no email, and no screen where you can read reports. So reports are currently invisible to you.

Proposed: add a founder-only **Reports** page to the admin panel listing every report (who reported whom, reason, notes, date) with a status you can set to Reviewing / Actioned / Dismissed, plus an email alert to the founders' inbox whenever a new report comes in.

## Technical notes
- Frontend: OwnerDetail.tsx (remove ShareDialog), Dashboard.tsx header, BottomNav.tsx (owner tabs), Applications.tsx + useApplications.ts (sort/filter, review counts fetched per applicant).
- Email: split buildBody in supabase/functions/trust-strike-emails/index.ts into nomad and host variants; redeploy.
- Reports: new admin RPC guarded by is_admin_user() to list reports and update status (reports has RLS, so reads go through a security-definer function), new /admin/reports route under AdminRoute, link in AdminNav; new-report alert email via the existing Resend sender.
