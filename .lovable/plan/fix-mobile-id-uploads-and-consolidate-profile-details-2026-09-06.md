# Fix mobile ID uploads and consolidate profile details

## 1. Make the ID and selfie controls work reliably on phones

The signed-in test account reaches the manual verification form correctly. The existing buttons open a file picker in desktop browser testing, so the remaining issue is the phone-specific handoff: each visible button programmatically clicks a hidden file input, a pattern some mobile browsers/webviews can ignore even though no error appears.

Changes:
- Replace the programmatic hidden-input click with a direct native file-input tap target styled as the existing button. This preserves the required user gesture on mobile.
- Keep one clear control for Photo ID and one for Selfie; on phones, the operating system can offer camera or photo library choices.
- Allow images or PDF for the Photo ID, but images only for the Selfie.
- Preserve the existing 10MB limit, selected-file preview/name, remove option, private upload, review submission, and visible error messages.
- Clean up preview URLs when a file is replaced or the page closes.

## 2. Keep profile information only on the profile pages

Remove the duplicated Account section from Settings, including profile photo, name, email display, city, country, and its Save Changes button.

- Nomad information remains editable on **Edit Nomad Profile**.
- Pet Parent information remains editable on **Edit Pet Parent Profile**.
- For single-role members, move the existing **Upgrade to Combined** action into its own polished **Membership** card in Settings.
- Combined members will not see an unnecessary upgrade card.
- Email and password management remain in the existing **Login & Security** section.

## 3. Use Current Location for both Nomad discovery features

The Edit Nomad Profile save flow already writes the city/country used for City Chats and saves coordinates used by the Nomad map, so no separate location fields are needed.

- Keep **Current Location** as the single source for both features.
- Merge the two helper messages into one concise line: **“Pick your city from the suggestions so you appear on the Nomad map and join the right City Chat. Update it when you move.”**
- Keep the existing typed-location coordinate fallback and immediate Nomad map/list refresh.

## Verification

- On a phone-sized signed-in session, tap both Photo ID and Selfie controls and confirm the native chooser opens, selected files preview, and Submit for Review enables.
- Submit two test images and confirm the pending-review state appears without exposing the private documents.
- Confirm Settings no longer duplicates profile details and shows Membership only for one-way members.
- Change the Nomad city using a suggestion, save, and confirm the same city supports City Chat access while its coordinates place the member on the Nomad map.
