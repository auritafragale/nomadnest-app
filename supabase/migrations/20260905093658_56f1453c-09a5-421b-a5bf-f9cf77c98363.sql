-- 1. Add owner_user_id column
ALTER TABLE public.welcome_guides
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Backfill owner_user_id from listings
UPDATE public.welcome_guides g
SET owner_user_id = l.owner_user_id
FROM public.listings l
WHERE l.id = g.listing_id AND g.owner_user_id IS NULL;

-- 3. Deduplicate: keep the most recently updated guide per owner, delete the rest
DELETE FROM public.welcome_guides g
USING public.welcome_guides g2
WHERE g.owner_user_id IS NOT NULL
  AND g2.owner_user_id = g.owner_user_id
  AND (g2.updated_at > g.updated_at
       OR (g2.updated_at = g.updated_at AND g2.id > g.id));

-- 4. Drop the per-listing unique constraint and foreign key
ALTER TABLE public.welcome_guides
  DROP CONSTRAINT IF EXISTS welcome_guides_listing_id_key;
ALTER TABLE public.welcome_guides
  DROP CONSTRAINT IF EXISTS welcome_guides_listing_id_fkey;
ALTER TABLE public.welcome_guides
  ALTER COLUMN listing_id DROP NOT NULL;

-- 5. Enforce one guide per owner
CREATE UNIQUE INDEX IF NOT EXISTS welcome_guides_owner_user_id_key
  ON public.welcome_guides (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- 6. Recreate policies on owner_user_id
DROP POLICY IF EXISTS "Confirmed nomads can read the welcome guide" ON public.welcome_guides;
DROP POLICY IF EXISTS "Owners manage their welcome guide" ON public.welcome_guides;

CREATE POLICY "Owners manage their welcome guide"
  ON public.welcome_guides
  FOR ALL
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Confirmed nomads can read the welcome guide"
  ON public.welcome_guides
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.sits s
      JOIN public.listings l ON l.id = s.listing_id
      WHERE l.owner_user_id = welcome_guides.owner_user_id
        AND s.sitter_user_id = auth.uid()
        AND s.status IN ('confirmed', 'in_progress', 'completed')
    )
  );

-- service_role already has full table privileges; ensure authenticated can use it
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welcome_guides TO authenticated;
GRANT ALL ON public.welcome_guides TO service_role;