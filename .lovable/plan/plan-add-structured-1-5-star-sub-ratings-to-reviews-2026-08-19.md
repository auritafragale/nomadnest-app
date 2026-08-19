# Plan: Add structured 1–5 star sub-ratings to reviews

## Current state (verified)

`WriteReviewDialog.tsx` currently collects only:
- A single overall 1–5 star rating
- One optional free-text comment (max 1000 chars)

The `reviews` table has: `id, sit_id, reviewer_user_id, reviewee_user_id, rating (integer NOT NULL), text, created_at`. No sub-ratings exist. `WriteReviewDialog` receives a `reviewType: "owner" | "sitter"` prop that already distinguishes who is being reviewed, so we can branch the category set on it.

The `rating` column feeds the average-rating displays (`useOwnerReviews`, `useSitterReviews`) and the star shown on review cards. Keeping it populated (as the average of sub-ratings) preserves all existing display logic.

## Sub-rating categories (approved)

**Reviewing a Nomad (sitter) — `reviewType === "sitter"`** (reviewer is the Pet Parent):
1. Pet Care & Attention
2. Communication
3. Cleanliness & Tidiness
4. Reliability (arrived on time, followed instructions)
5. Respect for Home

**Reviewing a Pet Parent (owner) — `reviewType === "owner"`** (reviewer is the Nomad):
1. Communication
2. Home Accuracy (matched the listing)
3. Pet Preparedness (pets/info ready)
4. Hospitality & Cleanliness
5. Clear Expectations

## Changes

### 1. Database migration (supabase--migration)

Add nullable `integer` columns to `public.reviews` (all nullable, since only the relevant set is filled per review):

- `rating_pet_care` — Nomad reviews only
- `rating_communication` — both
- `rating_cleanliness` — Nomad reviews only
- `rating_reliability` — Nomad reviews only
- `rating_respect_home` — Nomad reviews only
- `rating_home_accuracy` — Pet Parent reviews only
- `rating_pet_preparedness` — Pet Parent reviews only
- `rating_hospitality` — Pet Parent reviews only
- `rating_clear_expectations` — Pet Parent reviews only

No new table, no RLS policy changes (existing policies cover all columns on `reviews`). Existing `rating` column stays NOT NULL and is written as the rounded average of the sub-ratings.

### 2. `WriteReviewDialog.tsx` (UI + insert)

- Replace the single star row with 5 category-specific star rows. Branch the category labels/keys by `reviewType`.
- Each category is required (submit disabled until all 5 are set).
- On submit, insert the 5 sub-rating values plus a computed `rating` = rounded average of the 5 sub-ratings, plus the existing `text`.
- Keep the existing notification + query invalidation logic unchanged.

### 3. Review display sections (`OwnerReviewsSection.tsx`, `SitterReviewsSection.tsx`)

- Fetch the new sub-rating columns (update the selects in `useOwnerReviews.ts` and `useSitterReviews.ts`).
- Below the existing overall star, render a compact breakdown row showing each category's label + small star rating, so viewers see the per-category scores.

### 4. Average rating

No change needed — `useOwnerAverageRating` and `useSitterAverageRating` already read the `rating` column, which will now hold the rounded average of sub-ratings. Existing reviews (single `rating` only) continue to display normally.

## Files touched
- Migration (new columns on `reviews`)
- `src/components/reviews/WriteReviewDialog.tsx`
- `src/components/reviews/OwnerReviewsSection.tsx`
- `src/components/reviews/SitterReviewsSection.tsx`
- `src/hooks/useOwnerReviews.ts`
- `src/hooks/useSitterReviews.ts`
- `src/integrations/supabase/types.ts` (auto-regenerated after migration)
