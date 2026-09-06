# Three small fixes: invite button, guide spacing, mystery chat

## 1. Invitations card (Nomad mode)
Change the action button label from "View & Apply" to just "View", keeping the eye icon. This stops the button text from being squeezed on narrow phones.

## 2. Welcome Guide card (Pet Parent mode)
- Reduce the gap between the "Welcome Guide" heading and the "Guide progress" row.
- Add breathing room under the progress bar so it no longer sits tight against the "Edit guide" button.

## 3. The chat with a question mark
Confirmed cause: two chat threads were started with members who no longer appear in the member directory (their profile is not publicly visible). With no name or photo to show, the list falls back to a "?" circle. Both threads contain zero messages.

Fix: hide any chat row whose other member cannot be shown, for both Nomads and Pet Parents. The chat data stays in the database; it simply no longer appears in the list, so nothing else breaks. If such a thread ever has real messages, it still stays hidden — these are empty placeholder threads only.

## Technical notes
- `src/components/invites/SitterInviteCard.tsx`: button text only.
- `src/components/dashboard/OwnerWelcomeGuideCard.tsx`: spacing classes on the header/content wrapper and the progress bar block.
- `src/hooks/useConversations.ts`: filter out grouped conversations where `other_user` is null before returning the list (applies to inbox list, and by extension unread counts stay driven by the existing unread hook).
