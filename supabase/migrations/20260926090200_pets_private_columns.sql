-- ═══════════════════════════════════════════════════════════════════════════
-- Security hardening: pets — make vet info and medication instructions private
-- ═══════════════════════════════════════════════════════════════════════════
--
-- APPLY ONLY AFTER the frontend that selects explicit pet columns is
-- published. After this migration, select("*") on pets fails for anon and
-- authenticated users.
--
-- 1. Read policies: public can read pets of published listings from active
--    owners (matching the listings rule); owners can read all their own pets,
--    including drafts. Replaces both the original repo policy and the live one.
-- 2. Column privileges: anon and authenticated can read every column EXCEPT
--    vet_info and medication_instructions. RLS is row-level only, so this is
--    what actually hides those two columns.
-- 3. get_pet_private_details(listing_id): the only way to read those two
--    columns from the app — for the listing owner only. (The handbook work will
--    extend it to the confirmed sitter during their sit.)
-- 4. anon can't write to pets at the privilege level either.
--
-- Owners can still INSERT/UPDATE vet_info and medication_instructions: only
-- SELECT is restricted.
--
-- NOTE FOR FUTURE MIGRATIONS: a new pets column is NOT readable by anon /
-- authenticated until it's added to the column grant. Add it to
-- PET_PUBLIC_COLUMNS in src/lib/privateColumns.ts as well.


-- ─── 1. Read policies ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view pets of visible listings" ON public.pets;
DROP POLICY IF EXISTS "Anyone can view pets of published listings" ON public.pets;
DROP POLICY IF EXISTS "Authenticated users can view pets of published listings" ON public.pets;
DROP POLICY IF EXISTS "Owners can view own pets" ON public.pets;

CREATE POLICY "Anyone can view pets of published listings"
ON public.pets
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = pets.listing_id
      AND l.status = 'published'::public.listing_status
      AND public.is_owner_active(l.owner_user_id)
  )
);

CREATE POLICY "Owners can view own pets"
ON public.pets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = pets.listing_id AND l.owner_user_id = auth.uid()
  )
);


-- ─── 2. Column privileges ───────────────────────────────────────────────────
-- Built from the live column list so any column that exists live but isn't in
-- the repo is still granted (only the two private columns are withheld).

DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'pets'
    AND column_name NOT IN ('vet_info', 'medication_instructions');

  EXECUTE 'REVOKE SELECT ON public.pets FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.pets TO anon, authenticated', v_cols);
END;
$$;


-- ─── 3. Owner accessor for the private columns ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_pet_private_details(p_listing_id uuid)
RETURNS TABLE (id uuid, vet_info text, medication_instructions text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.vet_info::text, p.medication_instructions::text
  FROM public.pets p
  JOIN public.listings l ON l.id = p.listing_id
  WHERE p.listing_id = p_listing_id
    AND l.owner_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_pet_private_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pet_private_details(uuid) TO authenticated;


-- ─── 4. Grants ──────────────────────────────────────────────────────────────

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pets FROM anon;
