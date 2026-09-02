# Admin access check + remaining launch items

## Admin access: verified

The database shows exactly two accounts with admin rights: **auritadxb@gmail.com** and **orecf001@gmail.com**. Nobody else has it. Admin status is stored on the profiles record, is not readable or writable from the browser, and every admin screen and admin database function checks it server-side. Per your choice, there will be no UI to grant admin to anyone else.

One small hardening step worth doing:

- Add an explicit safety net so the admin flag can never be turned on by a member editing their own profile, even if a future policy change slips through. (The existing escalation guard blocks changes to admin status only when the request comes through the normal signed-in path; the plan tightens it to block self-grants unconditionally.)

## Perks: nothing to change in code

The perks hub is fully built and the table is empty (0 perks), which is why members see the "rolling out" copy. You will add real partners yourself at `/admin/perks` once affiliate links are approved — no seeding, no placeholder partners. The hub already hides itself gracefully while empty, and each perk you add goes live immediately with click tracking.

## What else is left before/around launch

Founder actions (no code needed):
1. **Google Maps API key restrictions** — in Google Cloud Console, restrict the key to nomadnest.global plus the preview domains, and to Maps JavaScript / Places / Geocoding only. Currently unrestricted, which risks quota abuse.
2. **Real listings** — announce to the Facebook community with the founding code (`NOMADNEST2026FOUNDINGMEMBER`, 998 spots left) so Pet Parents create genuine listings.
3. **First perk partners** — add them at `/admin/perks` as affiliate approvals land.
4. **Onfido** — stays manual for now; needs the Onfido webhook secret when you're ready to automate.

Small app-side items in this plan:
- **Admin panel polish**: show the two founder emails on the `/admin` overview so it's obvious who holds access, and surface a warning if that ever changes.
- **Publish** the current build so the admin panel and the latest fixes are live on nomadnest.global.

## Technical notes

- Migration: update `prevent_privilege_escalation()` so an `is_admin` change is rejected for any non-admin caller regardless of request path, keeping service-role/admin tooling working.
- `src/pages/AdminHub.tsx`: add a small "Admin access" card listing the admin accounts returned by the existing `admin_list_members()` function (filtered to `is_admin`), no new database function needed.
- No changes to perks code, RLS, or grants.
