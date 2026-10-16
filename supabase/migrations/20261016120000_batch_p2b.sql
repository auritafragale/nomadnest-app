-- Batch P2b: perk logos from a PRIVATE bucket.
--
-- The workspace doesn't allow public buckets, so perk-logos was created as a
-- private bucket in Lovable's Storage settings (this migration doesn't create
-- or change any bucket). The app shows each logo through a signed link, which
-- needs read access to the file:
--   1. Anyone (visitors and members) can read files in perk-logos, and only
--      there. Logos are not private data. The admin-only upload, replace and
--      delete policies from Batch P2 stay as they are.
--   2. perks.logo_url now holds a file name in perk-logos (for example
--      "safetywing-1760000000000.png"), never a web link. The current values
--      are web page links, not images, so they are cleared: every perk shows
--      its letter tile until a logo is uploaded.

-- ── 1. Read access to perk-logos only ────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read perk logos" ON storage.objects;
CREATE POLICY "Anyone can read perk logos"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'perk-logos');

-- ── 2. logo_url is a file name in perk-logos ─────────────────────────────
UPDATE public.perks
SET logo_url = NULL
WHERE logo_url IS NOT NULL
  AND logo_url !~* '^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(png|webp|svg|jpe?g)$';

ALTER TABLE public.perks DROP CONSTRAINT IF EXISTS perks_logo_url_file_check;
ALTER TABLE public.perks
  ADD CONSTRAINT perks_logo_url_file_check
  CHECK (logo_url IS NULL OR logo_url ~* '^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(png|webp|svg|jpe?g)$');
