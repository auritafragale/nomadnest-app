CREATE OR REPLACE FUNCTION public.is_owner_active(_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.owner_profiles
    WHERE user_id = _owner_user_id AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_owner_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_active(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can view published listings from active owners" ON public.listings;

CREATE POLICY "Anyone can view published listings from active owners"
ON public.listings
FOR SELECT
TO anon, authenticated
USING (
  (status = 'published'::listing_status AND public.is_owner_active(owner_user_id))
  OR auth.uid() = owner_user_id
);

DROP POLICY IF EXISTS "Authenticated users can view pets of published listings" ON public.pets;

CREATE POLICY "Anyone can view pets of published listings"
ON public.pets
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.listings
    WHERE listings.id = pets.listing_id
      AND listings.status = 'published'::listing_status
  )
);