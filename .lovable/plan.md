# Fix "Not Authorised" on admin pages

## What's actually wrong

During the privacy lockdown, table-wide read access on `profiles` was replaced with per-column grants. Only these columns are readable by signed-in users: id, first_name, last_name, avatar_url, country, city, created_at, updated_at, full_name, bio, location, id_verified, email_verified.

`is_admin` is **not** in that list. The admin pages read it directly:

- `src/pages/AdminVerifications.tsx` — `.select("is_admin")`
- `src/pages/AdminPerks.tsx` — `.select("is_admin")`

That query now returns a permission error, the code treats it as "not admin", and you see "Not Authorised" even though both your accounts have `is_admin = true` in the database. This is a read-permission bug, not a missing admin flag.

Column-level grants are the only protection here (the profiles read policy allows any signed-in user to read any row), so re-granting `is_admin` would expose everyone's admin flag. The correct fix is to ask the database via the existing security-definer function instead.

## Two more places broken by the same lockdown

- `src/hooks/useMembership.ts` fallback path reads `founding_member, membership_status, membership_type` — all revoked, so the fallback silently reports "not subscribed" whenever the Stripe check fails.
- `src/hooks/useVerification.ts` reads `onfido_applicant_id, onfido_check_id` — revoked, so this query errors and the verification page loses its state.

## The fix

1. **Admin check** — replace the `profiles.is_admin` read in `AdminVerifications.tsx` and `AdminPerks.tsx` with a call to the existing `is_admin_user(auth.uid())` database function (security definer, already used by other admin functions). No schema change needed.
2. **Own membership** — add a small security-definer function returning the signed-in user's own `founding_member`, `membership_status`, `membership_type`, `membership_expiry`; use it in the `useMembership` fallback.
3. **Own verification** — add a security-definer function returning the signed-in user's own `id_verified`, `onfido_applicant_id`, `onfido_check_id`; use it in `useVerification`.

Both new functions read only the caller's own row (`auth.uid()`), so no member can see anyone else's membership or admin status.

## Verification

Sign in as auritadxb@gmail.com and confirm `/admin/verifications`, `/admin/perks` and `/admin/emails` load, plus that the Membership page still shows the correct founding-member status.

## Technical notes

- New functions: `public.get_my_membership()`, `public.get_my_verification()` — `stable security definer`, `set search_path = public`, `execute` granted to `authenticated` only.
- No changes to column grants or RLS policies; the lockdown stays intact.
- Frontend edits limited to the two admin pages and the two hooks.
