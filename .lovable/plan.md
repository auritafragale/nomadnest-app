# Seven mobile layout, chat consolidation, and Settings improvements

## 1. Fit both invitation actions cleanly
- Rename the invitation X action to **Decline** with its icon and accessible label.
- Rebalance the mobile invitation card so **View & Apply** starts farther left and both actions remain fully inside the card at 393px, without changing their existing behavior.

## 2. Replace the Welcome Guide count pill with progress
- Keep **Welcome Guide** and its information icon together on one line.
- Move completion status above the **Edit guide** action as a compact progress row and bar showing the completed fields out of five.
- Preserve loading, offline, incomplete-guide, and create-listing states.

## 3. Use information icons for explanatory card subheadings
- Audit the entire signed-in member experience and move explanatory card subtitles into accessible **i** tooltips beside their headings to save vertical space.
- Apply this to member dashboards, invitations, Settings, chats, sits, applications, profiles, and other authenticated member cards where the subtitle only explains the card.
- Keep essential content visible, including locations, dates, statuses, errors, empty states, form guidance, and user-generated text. Leave public and admin pages unchanged.
- Ensure every tooltip works with touch, keyboard, and screen readers.

## 4. Show one chat per member pair
- Consolidate the inbox so each pair of members appears once in both Nomad and Pet Parent modes, even when their history currently spans direct chats and multiple listings.
- Preserve each sit/listing’s internal context so Daily Check-ins, Care Logs, confirmed-sit routing, notifications, and listing references continue to target the correct sit.
- Combine messages from all underlying pair conversations into one chronological thread, aggregate unread counts, and use the latest message for ordering and preview.
- Update real-time message updates, read receipts, sending, invitation routing, and direct-message entry points to resolve through the shared pair thread.
- Backfill existing conversation records into pair groups without losing or duplicating messages, while retaining the current listing-specific records needed by sit workflows.

## 5. Combine email and password settings
- Replace the separate Change Email and Change Password cards with one **Login & Security** card.
- Add side-by-side **Email** and **Password** tabs matching the current Verification card pattern.
- Retain the existing verification status, validation, loading, and submission behavior.

## 6. Collapse Profile Visibility
- Make the Profile Visibility card closed by default with an accessible chevron header.
- Keep both role visibility switches, status indicators, explanatory note, and save behavior unchanged inside it.

## 7. Collapse Account
- Make the Account card closed by default with an accessible chevron header.
- Keep profile photo, name, email, location, save action, and the one-way-member Combined upgrade prompt inside the expanded panel.

## Validation
- Check Nomad and Pet Parent modes at 393×852 and desktop width.
- Confirm invitation buttons fit, Welcome Guide progress is readable, collapsible cards and tabs work by touch and keyboard, and member-card information tooltips remain accessible.
- Verify an existing member pair appears once in Chats, historical messages render chronologically, unread counts clear correctly, and new direct messages/invitations reuse that pair thread.
- Verify Daily Check-ins and Care Logs still use the correct listing when a pair has chats connected to more than one sit.

## Technical scope
- Frontend work covers invitations, Welcome Guide, authenticated card headers, Settings, inbox aggregation, message timelines, unread state, and conversation entry points.
- Add a member-pair grouping table/key with authenticated-only grants and row-level access for the two participants; backfill existing conversations while preserving listing-specific conversation IDs and message records.
- No membership pricing, verification logic, profile visibility rules, or public/admin page designs will change.
