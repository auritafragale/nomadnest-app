DROP POLICY IF EXISTS "Anyone can read perk logos" ON storage.objects;
CREATE POLICY "Anyone can read perk logos"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'perk-logos');

UPDATE public.perks
SET logo_url = NULL
WHERE logo_url IS NOT NULL
  AND logo_url !~* '^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(png|webp|svg|jpe?g)$';

ALTER TABLE public.perks DROP CONSTRAINT IF EXISTS perks_logo_url_file_check;
ALTER TABLE public.perks
  ADD CONSTRAINT perks_logo_url_file_check
  CHECK (logo_url IS NULL OR logo_url ~* '^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(png|webp|svg|jpe?g)$');