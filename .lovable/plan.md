# Nine dashboard, invitations, messaging and Settings fixes

## 1. Keep invitation actions inside the mobile card
- Rework the invitation card’s mobile action row so the primary “View & Apply” button and the X decline button align from the left and always fit within the card.
- Keep the existing desktop layout and invitation actions unchanged.

## 2. Simplify the Welcome Guide card
- Keep the completion pill beside “Welcome Guide,” but give it the same readable text sizing and weight as the “Edit guide” button.
- Remove “One guide shared across all your listings” and “Nomads you confirm…” from completed guides.
- Keep loading, offline, empty-guide and create-listing states functional.

## 3. Remove Pet Parent stats and badge Applicants
- Remove the Pet Parent “Your Stats” card from the dashboard.
- Add the existing new-applications count to the mobile “Applicants” navigation item using the same compact badge treatment as Chats.
- Show the badge only when there are pending applications, cap the displayed value at `9+`, and keep the count refreshed through the existing applications-count hook.

## 4. Reuse chats for invitations
- When a Pet Parent sends a sit invitation, first reuse an existing conversation for that same Pet Parent–Nomad pair instead of automatically creating another chat.
- Prefer the conversation already attached to that listing; otherwise use the pair’s most recent existing chat. Create a new listing chat only when the pair has no conversation.
- Post the invitation message into the selected conversation and update its activity time so it appears at the top of Chats.
- Preserve the listing-specific conversation rules used by confirmed-sit messages and daily check-ins.

## 5. Show role upgrade only for one-way members
- Remove the Current Role/Combined information block from the Account card for Combined members.
- For Nomad-only and Pet-Parent-only members, replace the current role explanation with a compact upgrade prompt and CTA leading to the Combined membership option.
- Do not change membership pricing or access rules.

## 6. Collapse email and password controls
- Convert “Change Email” and “Change Password” into closed-by-default collapsible cards.
- Keep their current validation, loading states, verification status and submission behavior inside the expanded panels.
- Use accessible expand/collapse controls with clear chevrons and mobile-safe spacing.

## 7. Combine verification into two tabs
- Replace the separate Identity Verification and Phone Verification cards with one “Verification” card.
- Add side-by-side “Identity” and “Phone” tabs, each retaining its existing status, actions and verification flow.
- Ensure both tabs fit cleanly on mobile and communicate verified/not-verified state without changing verification logic.

## 8. Collapse Notifications and simplify Push
- Make the Notifications card closed by default and preserve all existing email preference switches inside it.
- Replace the Push Notifications status pill plus Enable/Disable button with one labelled on/off switch.
- Keep unsupported, loading and browser-blocked states clear; retain the browser permission guidance when blocked and the test-notification action when enabled.
- Ensure the row stays within a 393px mobile screen.

## 9. Remove the Settings sign-out card
- Remove the standalone Sign Out card and its now-unused page-level sign-out code/imports.
- Keep sign-out available from the existing top-right menu.

## Validation
- Check both Nomad and Pet Parent modes at the current 393×852 mobile size and at desktop width.
- Verify invitation actions remain visible, the Welcome Guide is compact/readable, Applicants receives the correct badge, and Combined members see no Current Role block.
- Verify all collapsible cards and verification tabs work by keyboard and touch.
- Verify push switching, email/password changes, verification actions, and invitation delivery still work.
- Confirm an invitation between members with an existing chat adds to that chat and does not create a duplicate conversation.

## Technical scope
- Frontend changes will be limited to the invitation card, Welcome Guide card, Pet Parent dashboard, mobile navigation, Settings page, push settings, and reusable conversation resolver/invite hook.
- No new tables or membership-rule changes are required.
