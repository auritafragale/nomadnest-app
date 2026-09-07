# Ninth audit fixes: uploads and membership

## Priority 1 — make identity verification reliable end to end

- Replace each single ambiguous selector with two explicit, native mobile controls:
  - **Take Photo** opens the rear camera for Photo ID and front camera for Selfie.
  - **Upload Photo/File** opens the library/files picker; Photo ID continues to support images and PDF, while Selfie remains image-only.
- Keep the chosen ID and selfie visible until the member removes or replaces them. Remove the preview URL race that can make an image briefly appear and then disappear after returning from the phone camera.
- Preserve clear validation, but show the actual limits before selection: non-empty files, supported type, and maximum 10MB per file. Give each field its own error so one failed choice does not erase the other.
- Make submission recoverable: use collision-safe paths, clean up partially uploaded files if the second upload or record creation fails, prevent duplicate taps, and show an unmistakable pending-review state after success.
- Add the missing authenticated access grant for members to create/read their own manual verification submission, while retaining the existing private-document folder rules and admin-only review access.
- Verify the complete flow rather than only checking that a picker opens: camera and library selection, persistent previews, enabled Submit button, both private uploads, creation of the pending review record, and visibility in the admin review queue. Run mobile checks at the current 393×852 size and cover iOS/Android-style capture markup.

## Fix onboarding profile-photo upload

- Add the missing authenticated update grant for the safe, member-editable profile fields, including `avatar_url`; keep protected account, membership, verification, and admin fields blocked by the existing privilege-escalation safeguards.
- Set the image limit to 10MB, state it beside the selector, and make mobile selection use a direct native input rather than a programmatic hidden-input click.
- Revoke temporary preview URLs safely and keep the prior avatar when upload or profile saving fails.
- Test the exact six-step onboarding path as a normal new member, confirming both storage upload and profile-photo persistence. The audit’s file did reach storage; the confirmed failure was the missing profile update permission, not file size.

## Dashboard cleanup

- For members without an active membership, make **View plans** a full-width row below the main profile actions.
- Place the Settings cog beside **Edit Profile**.
- Remove the dashboard **Also become a Nomad/Pet Parent** control for single-role members. The Combined upgrade remains available in the Settings Membership area as previously requested.

## Complete the Settings Membership card

- Show every signed-in member’s current plan and status in the existing Membership card.
- Show the renewal/expiry date for paid memberships and “Lifetime access” for founding members.
- For inactive members, retain the Combined upgrade option where applicable and provide a clear route to view plans.
- Add **Manage** for paid members and take them to `/membership`, as requested.
- Add a signed-in management section on `/membership` that displays current plan, renewal status/date, and saved card summary when available, with a secure action to open Stripe’s hosted portal for changing the card or cancelling/controlling renewal. Founding members will see lifetime status without irrelevant payment controls.
- Extend the existing authenticated membership response only with the Stripe fields needed for this display; never expose full card details. Return members to `/membership` after hosted management and refresh their status.

## Technical notes

- Frontend: `VerifyIdentity.tsx`, `AvatarUpload.tsx`, `DashboardHeader.tsx`, `Dashboard.tsx`, `Settings.tsx`, `Membership.tsx`, and the shared membership hook/status UI.
- Backend: a migration for narrowly scoped grants on `profiles` and `manual_id_verifications`; update and redeploy `check-subscription` / `customer-portal` only as needed for safe plan, renewal, card-summary, and portal behavior.
- Validation: typecheck and diff checks; authenticated desktop/mobile browser checks; direct database/storage verification of grants and private paths; temporary test artifacts removed after the end-to-end upload test.
