# Fix Welcome Guide saving + tidy the community sits preview

## 1. Every Pet Parent can save their Welcome Guide

Saving currently fails with a database error for anyone who hasn't saved a guide before. The rule that keeps one guide per Pet Parent was set up in a way the save action can't match, so the save is rejected.

Fix:
- Make the Pet Parent link on a guide required, and replace the conditional one-guide rule with a plain one-guide-per-Pet-Parent rule the save can use.
- No data is lost: the single existing guide already has its Pet Parent set.
- After that, saving works for first-time and repeat saves, from the dashboard card and the guide page.

## 2. Logged-out home page: "From Our Community" is display only

- Remove the "View All Sits" button below the sits grid.
- Remove the "View" link from each sit card and stop the cards from being tappable, so the section is purely a taste of real sits rather than a way into the app.

## Technical notes

- `public.welcome_guides`: `ALTER COLUMN owner_user_id SET NOT NULL`, drop the partial unique index `welcome_guides_owner_user_id_key`, add a non-partial `UNIQUE (owner_user_id)` constraint so the client's `upsert(..., { onConflict: "owner_user_id" })` in `src/hooks/useWelcomeGuide.ts` resolves. Root cause confirmed: the existing index is `... WHERE (owner_user_id IS NOT NULL)`, which Postgres will not accept for `ON CONFLICT`.
- `src/components/landing/FeaturedStaysSection.tsx`: drop the `Link` wrapper in `DemoCard`, remove the "View" span, remove the bottom CTA block and now-unused imports (`Button`, `ArrowRight`, `Link`).
