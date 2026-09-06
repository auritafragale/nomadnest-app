# Fix ID photo uploads and make the visibility toggle instant

## 1. Identity verification: choosing/taking a photo does nothing

What I checked: the private document store and its access rules are correctly set up for this (members can upload into their own folder, only founders can read), and the review records table accepts new submissions. So the failure is on the phone side of the flow, not the storage side. In your screenshot neither file is listed as "Selected" and **Submit for Review** is still greyed out, which means the picked photo never reached the page. That is consistent with the very narrow list of accepted file types on both buttons: phone cameras and newer iPhones hand over formats (or files with no type at all) that the current list silently rejects, so nothing is added and no message is shown.

Changes to the Verify Your Identity page:

- Accept any image the phone offers (plus PDF for a scanned ID) instead of the current fixed short list, so the camera and gallery both return a usable file.
- Show a small thumbnail preview and the file name after each choice, with a "Remove" option, so it is obvious the photo was accepted.
- If a chosen file is not usable (empty, wrong kind, or over the size limit) show a clear on-screen message instead of failing silently.
- Show the real reason on screen if the upload itself fails, so any remaining problem is reportable rather than invisible.
- Keep everything else the same: the same two documents, the same private storage, the same 24–48 hour founder review, the same notifications.

## 2. Nomad visibility toggle isn't instant

Confirmed: the Nomads Near Me page loads the list of visible nomads once when you open it and never reloads it, and the visibility switch only updates the switch itself. That is exactly why leaving the section and coming back is needed today.

Changes:

- After the switch is saved, refresh the map data straight away, and also refresh the nomad directory list, so pins appear or disappear immediately in both places.
- Keep the existing confirmation message and the safe rollback if saving fails.

Also worth knowing: the test account `aurita.fragale91+paytest@gmail.com` is currently set to visible but has no saved location, so it can never show a pin. You mentioned no city/country suggestions appeared when editing your profile, so the location was typed by hand and no coordinates were stored — I'll check the profile location field uses the same suggestion box as elsewhere, and save coordinates for a typed location as a fallback, so a pin appears either way. The two founder accounts do have coordinates, so they will behave correctly once the instant refresh is in.

## Technical notes

- `src/pages/VerifyIdentity.tsx`: widen `accept` to `image/*,application/pdf`, add per-file validation (non-empty, size cap, type check that tolerates empty MIME types), derive the stored extension from the file name and fall back to the MIME type or `jpg`, add object-URL previews with cleanup, and surface upload/insert errors inline as well as via toast.
- `src/components/browse/NomadVisibilityBanner.tsx`: after the `is_visible` update succeeds, invalidate the nomad queries.
- `src/pages/FindNomads.tsx` and `src/hooks/useSitters.ts`: move the one-shot `useEffect` fetches to React Query (`["nomads-map"]`, `["sitters", filters]`) so they can be invalidated; behaviour, filters and sorting stay identical.
- No database, storage or edge function changes.

## Verification

- Simulate a camera-style file (empty MIME type, no extension) on the verification page: it should preview, name itself, and enable Submit; then confirm the upload lands in the private bucket and a pending review row is created.
- Toggle visibility on the Nomads Near Me page and confirm the pin appears/disappears without leaving the page.
