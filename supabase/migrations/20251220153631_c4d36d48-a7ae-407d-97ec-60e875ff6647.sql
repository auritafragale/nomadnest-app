-- Add is_active column to sitter_profiles
ALTER TABLE public.sitter_profiles
ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Add is_active column to owner_profiles
ALTER TABLE public.owner_profiles
ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Update RLS policy for sitter_profiles to only show active profiles publicly
DROP POLICY IF EXISTS "Anyone can view sitter profiles" ON public.sitter_profiles;

CREATE POLICY "Anyone can view active sitter profiles"
ON public.sitter_profiles
FOR SELECT
USING (is_active = true OR auth.uid() = user_id);

-- Update RLS policy for owner_profiles to only show active profiles publicly
DROP POLICY IF EXISTS "Anyone can view owner profiles" ON public.owner_profiles;

CREATE POLICY "Anyone can view active owner profiles"
ON public.owner_profiles
FOR SELECT
USING (is_active = true OR auth.uid() = user_id);

-- Also hide listings from paused owner profiles
DROP POLICY IF EXISTS "Anyone can view published listings" ON public.listings;

CREATE POLICY "Anyone can view published listings from active owners"
ON public.listings
FOR SELECT
USING (
  (status = 'published'::listing_status AND EXISTS (
    SELECT 1 FROM public.owner_profiles
    WHERE owner_profiles.user_id = listings.owner_user_id
    AND owner_profiles.is_active = true
  ))
  OR auth.uid() = owner_user_id
);