# Phase 3 — UX improvements (filters, Welcome Guide, check-ins)

The data for all three Phase 3 features is already in the database (pet behaviour fields, home capability flags, `welcome_guides`, `sit_checkins`). This phase builds the screens.

## 1. Pet-behaviour & home-capability details

**Pet Parent side (listing create + edit)**
- Pets step gains, per pet: "Medication required" (yes/no), "How long can they be left alone?" (never / 1–4 hours / 4–8 hours), "Reactive to other animals" (yes/no).
- Home step gains three switches: "Remote location", "Car needed", "Plant Care".
- Saved on create and edit, and shown on the listing page as small labelled chips so Nomads see them before applying.

**Nomad side (Browse Sits)**
- New filter group in both the desktop filter bar and the mobile filter sheet: No medication needed · Pet can be left 4–8 hours · Not reactive to other animals · No car needed · No Plant Care · Remote location OK.
- Also a "No Pets" option: Pet Parents can tick "Plant Care" and add no pets when creating a listing, and Nomads can filter Browse Sits for these plant-only, pet-free sits.
- Filters combine with the existing ones and clear with "Clear all".

## 2. Offline Welcome Guide
- Pet Parents get an "Welcome Guide" editor reachable from each listing they own (dashboard listing card + listing page owner actions), with four sections: Wi-Fi info, vet info, feeding schedule, emergency contacts, plus free-text house notes.
- Nomads with a confirmed sit for that home get a "Welcome Guide" button on their upcoming/active sit, opening a read-only guide screen.
- The guide is cached on the Nomad's device the first time it opens, so it still displays with no signal, with a small "Saved for offline — last updated ..." line.

## 3. Structured check-in updates
- During an active sit (status in progress) the Nomad sees three quick buttons on the sit: Pets Fed · Meds Given · Walk Completed, each optionally with one photo and a short note.
- Each tap posts a timestamped entry into a shared check-in feed on the sit, sends the entry as a message into the existing conversation with the Pet Parent, and creates an in-app notification for them.
- The Pet Parent sees the same feed, newest first, on the sit.

## Technical notes
- No migration needed: `pets.requires_medication / separation_anxiety_tolerance / reactive_to_animals`, `listings.remote_location / car_needed / heavy_gardening`, `welcome_guides` and `sit_checkins` all exist with RLS. Only the photo upload for check-ins reuses the existing `listing-images` bucket.
- Files touched: `useListingForm.ts` (new form fields), `listing/steps/PetsStep.tsx`, `listing/steps/HomeInfoStep.tsx`, `CreateListing.tsx`, `EditListing.tsx`, `ListingDetail.tsx` (chips + owner guide entry), `useListings.ts` + `browse/ListingFilters.tsx` + `mobile/FilterBottomSheet.tsx` + `BrowseSits.tsx` (filters).
- New: `hooks/useWelcomeGuide.ts` (with localStorage cache), `pages/WelcomeGuide.tsx` (read view) + `components/listing/WelcomeGuideEditor.tsx`, `hooks/useSitCheckins.ts`, `components/sits/SitCheckinPanel.tsx`, and a `SitDetail` surface reached from `UpcomingPastSits.tsx` (there is no sit detail page today, so check-ins and the guide live on a new `/sits/:id` route).
- Verification: `npx tsgo --noEmit`, plus a browser pass at 393×852 on listing create (new pet/home fields), Browse Sits filters, the welcome guide offline read, and a check-in post.

Not in scope here: the urgent-sit push broadcast to nearby Nomads (Phase 2 item 5) — badges exist, the radius alert is still open and can follow after Phase 3.
