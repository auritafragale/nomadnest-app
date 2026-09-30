-- Arrival Check-In: the Nomad can delete their own photos, and each photo
-- keeps the date it was taken.
--
-- 1. arrival_vault_photos.taken_at (when the photo was taken, read on the
--    device before the photo is re-encoded without its metadata). Private to
--    the Nomad like the rest of the row; included in export-my-data through
--    the existing to_jsonb(v) row export.
-- 2. The Nomad can delete their own rows, except a photo attached as evidence
--    to a flag (review_flag_evidence.photo_url), which must stay.
-- 3. The Nomad can delete the file in their own folder of the private
--    arrival-vault-photos bucket, once its row is gone and it isn't evidence.
--
-- Policies call SECURITY DEFINER helpers, so they never read other tables'
-- rows under the caller's permissions. No bucket changes.

ALTER TABLE public.arrival_vault_photos ADD COLUMN IF NOT EXISTS taken_at timestamptz;

-- Column grants: the Nomad reads and writes their own rows (RLS decides which rows).
GRANT SELECT (taken_at), INSERT (taken_at) ON public.arrival_vault_photos TO authenticated;

-- Is this storage path attached to a flag as evidence?
CREATE OR REPLACE FUNCTION public.arrival_photo_is_evidence(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.review_flag_evidence e WHERE e.photo_url = p_path);
$$;
REVOKE ALL ON FUNCTION public.arrival_photo_is_evidence(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arrival_photo_is_evidence(text) TO authenticated, service_role;

-- May this file be deleted? Not evidence, and its photo row is already gone.
CREATE OR REPLACE FUNCTION public.arrival_photo_file_deletable(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.arrival_photo_is_evidence(p_path)
     AND NOT EXISTS (SELECT 1 FROM public.arrival_vault_photos v WHERE v.photo_url = p_path);
$$;
REVOKE ALL ON FUNCTION public.arrival_photo_file_deletable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arrival_photo_file_deletable(text) TO authenticated, service_role;

-- Any earlier DELETE policies on these would be OR-ed with the new ones and
-- could skip the evidence check, so remove them first.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos' AND cmd = 'DELETE'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.arrival_vault_photos', r.policyname);
  END LOOP;
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'DELETE'
      AND qual ILIKE '%arrival-vault-photos%'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
  END LOOP;
END;
$$;

GRANT DELETE ON public.arrival_vault_photos TO authenticated;

CREATE POLICY "Nomads delete their own arrival photos"
  ON public.arrival_vault_photos
  FOR DELETE
  TO authenticated
  USING (sitter_user_id = auth.uid() AND NOT public.arrival_photo_is_evidence(photo_url));

CREATE POLICY "Nomads delete their own arrival photo files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'arrival-vault-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.arrival_photo_file_deletable(name)
  );
