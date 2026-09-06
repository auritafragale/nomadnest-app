# Fill the mobile chat viewport

## Goal
Remove the empty band below an opened conversation so the chat card extends down to the fixed bottom navigation in both Nomad and Pet Parent modes.

## Changes
- Make the mobile Chats page use the exact available viewport height between the fixed top bar and fixed bottom navigation.
- Avoid reserving the bottom-navigation height twice on the Inbox page while preserving the shared spacer behavior on other signed-in pages.
- Keep the conversation header, message composer, and care/check-in strip fixed within the card while the message history uses the remaining height and scrolls normally.
- Preserve the existing desktop layout and the role-specific Messages/City Chats behavior.

## Validation
- Open a conversation in Nomad mode and Pet Parent mode at the supplied mobile viewport size.
- Confirm the chat card ends directly above the bottom navigation with no large empty gap or overlap.
- Confirm long message history scrolls, the composer remains visible, and switching back to the conversation list still works.
- Run the TypeScript check and focused browser checks at mobile and desktop sizes.

## Technical details
- Update the Inbox flex/min-height and viewport calculations to use a single source of truth for the top and bottom fixed bars.
- Add a route-specific exception to the app-level mobile navigation spacer only if needed so `/inbox` owns its full-height layout without changing spacing elsewhere.
