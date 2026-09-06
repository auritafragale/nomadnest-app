# Role-aware Nomad and Pet Parent colours

## Goal
Make the signed-in experience visually follow the selected mode:

- **Nomad Mode:** coral is the primary colour and teal is secondary, matching the logged-out “Become a Nomad” design.
- **Pet Parent Mode:** teal becomes primary and coral becomes secondary, matching the logged-out “List Your Home” design.
- **Logged-out pages:** keep the current coral-primary/teal-secondary brand presentation.

## Implementation

1. **Add role-aware colour tokens**
   - Keep the existing coral and teal values as the canonical brand colours.
   - Add a Pet Parent theme state that swaps `primary` with `secondary`, including their light backgrounds, focus rings, glow/shadow accents, and related navigation tokens.
   - Apply the theme from the existing active-mode state so Combined members see the colours update immediately when switching modes; single-role members automatically receive their correct mode colours.
   - Preserve the same swap in light and dark themes.

2. **Use semantic colours throughout the signed-in experience**
   - Replace hardcoded coral styling in mode-aware controls with the shared primary/secondary tokens, especially the mobile mode switch, bottom navigation, notification dots, filters, listing/profile actions, Welcome Guide controls, and map/listing accents.
   - Ensure Pet Parent primary actions, active tabs, selected filters, links, icons, and primary pills become teal; secondary Pet Parent pills and accents become coral.
   - Ensure Nomad primary actions and active states remain coral, while secondary Nomad pills and accents use the same teal shown in Pet Parent Mode.
   - Leave meaning-based colours unchanged: green verification/success indicators, red errors/destructive actions, amber warnings, and gold Founding Member styling.

3. **Keep public and neutral screens predictable**
   - Logged-out marketing, authentication, legal/help, and other screens without an active member mode retain coral as primary and teal as secondary.
   - Shared signed-in pages such as Chats, Settings, Membership, and notifications follow the member’s current mode.

4. **Verify the colour switch**
   - Check Nomad, Pet Parent, and Combined accounts on mobile and desktop.
   - For Combined accounts, switch modes and confirm buttons, pills, active tabs, navigation, focus states, and key dashboard/profile/listing screens update without a refresh.
   - Confirm contrast and readability in both light and dark modes, and run the project checks.

## Technical details

- Extend the existing active-role provider to expose the selected role as a root-level theme attribute/class.
- Define the role swap centrally in the global design tokens rather than adding page-by-page colour overrides.
- Refactor remaining mode-aware hardcoded coral/teal values to semantic Tailwind classes so future brand changes stay consistent.
