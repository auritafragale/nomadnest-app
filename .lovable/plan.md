# Why Clare can't re-apply, plus a scrollable photo viewer

## 1. The blocked application

What the data shows for "Cute home with a puppy": the Dubai dates were **edited in place** — there is still only one date entry, now 6-7 Sep, and Clare has exactly one application against it with the status "cancelled" (cancelled by the Pet Parent).

The apply screen checks "has this Nomad already applied for this date entry?" **without looking at the status**. So a cancelled (or withdrawn, or declined) application still counts as "already applied" and the dates disappear from her apply list. Because editing the dates reuses the same entry, her old cancelled application is still attached to the new 6-7 Sep dates.

Fix:
- When checking for an existing application, only count ones that are still live: applied, shortlisted or accepted. Cancelled, declined and withdrawn no longer block a fresh application.
- Same rule for the "5 Nomads under review" cap — it already only counts live applications, so no change there.
- Because a Nomad can now have more than one application row for the same dates over time, confirm the database doesn't have a uniqueness rule on (listing, dates, Nomad) that would reject the new row; if it does, replace it with one that only applies to live applications.
- Add a short line on the apply screen when a previous application was cancelled or declined, so it's clear re-applying is allowed.

Note on the wider behaviour: editing a date range keeps the same entry, so any past applications stay linked to it. That is fine once the status check above is in place.

## 2. Photo viewer should scroll through all photos

On a Nomad profile, opening a photo shows only that one photo and you must close it to view the next.

Fix: turn the full-size viewer into a browsable gallery — left/right arrows, keyboard arrows, swipe on mobile, a counter such as 2/6, and thumbnails along the bottom to jump straight to a photo. It opens on whichever photo was tapped. Same viewer behaviour for the Pet Parent profile photos so both pages match.

## Technical notes

- `src/components/applications/ApplyDialog.tsx`: add `.in("status", ["applied","shortlisted","accepted"])` to the "mine" query; keep the cap query as-is; surface a "you previously applied, this was cancelled" hint.
- Verify/adjust any unique index on `applications (listing_id, sit_dates_id, sitter_user_id)` via a partial unique index limited to live statuses.
- `src/pages/SitterDetail.tsx` (and `src/pages/OwnerDetail.tsx` for parity): replace the single-image `Dialog` with a carousel-based lightbox (existing `ui/carousel`), starting index synced to `selectedPhoto`, with thumbnails and keyboard/swipe navigation.
