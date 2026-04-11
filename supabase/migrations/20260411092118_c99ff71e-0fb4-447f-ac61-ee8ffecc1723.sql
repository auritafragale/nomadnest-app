
-- Add new columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS membership_type TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS founding_member BOOLEAN DEFAULT true;

-- Populate full_name from existing first_name + last_name
UPDATE public.profiles SET full_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) WHERE full_name IS NULL;

-- Populate location from existing city + country
UPDATE public.profiles SET location = TRIM(COALESCE(city, '') || CASE WHEN city IS NOT NULL AND country IS NOT NULL THEN ', ' ELSE '' END || COALESCE(country, '')) WHERE location IS NULL AND (city IS NOT NULL OR country IS NOT NULL);

-- Add coordinates to listings for map view
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- Add coordinates to sitter_profiles for Find Nomads map
ALTER TABLE public.sitter_profiles ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE public.sitter_profiles ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- Create indexes for spatial queries
CREATE INDEX IF NOT EXISTS idx_listings_coordinates ON public.listings (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sitter_profiles_coordinates ON public.sitter_profiles (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
