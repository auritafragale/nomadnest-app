# Verified badges: current state and the gap

## Short answer

Partly. It works for Nomads, not for Pet Parents.

Confirmed by reading the code:

- **Nomad profile page** — shows an "ID Verified" badge (plus Email Verified / Phone Verified badges) next to the name.
- **Browse Nomads cards, list view, and the Nomads map pins** — show the verified check mark.
- **Pet Parent profile page** — shows only "Email Verified" and the Founding Member badge. It does not fetch or display `id_verified` at all, so a verified Pet Parent looks unverified to everyone.
- **Listing detail page (the host block)** — shows the owner's name, avatar and rating, but no verification badge.

So the Safety page claim that "verified members receive a badge on their profile that is visible to everyone" is not yet true for the Pet Parent side.

## What to build

1. **Pet Parent profile page**: include `id_verified` (and `phone_verified`) in the profile query and render the same badge set the Nomad page uses — green "ID Verified", blue "Email Verified", "Phone Verified", Founding Member.
2. **Listing detail host block**: show a compact "ID Verified" badge next to the host name when the owner is verified.
3. **Listing cards on Browse Sits**: small verified check on the host avatar/label where a host is shown, matching the Nomad card treatment.
4. **Shared badge component**: extract one `VerificationBadges` component so Nomad and Pet Parent pages stay visually identical and future changes only happen in one place.

## Technical notes

- `profiles.id_verified` already exists and is set by the admin approval flow and the Onfido webhook; no schema change needed.
- The listing detail page already selects the owner's `profiles` row — add the verification columns to that select rather than a new query.
- Badge styling reuses the existing tokens used on the Nomad page (green/blue outline variants), no hardcoded colors added.
- Public read access to those boolean columns needs a quick check against the current `profiles` select policy; if anonymous visitors can't read them, the badge stays hidden for guests and we surface it for signed-in members only rather than loosening the policy.
