-- Arrival Check-In photos: tighten the member policies.
--
-- An older policy "Nomad manages own arrival vault photos" (FOR ALL,
-- sitter_user_id = auth.uid()) was OR-ed with the DELETE policy from
-- 20260930090000_arrival_photo_delete, so a Nomad could still delete a photo
-- attached to a flag as evidence. It also allowed UPDATE, and INSERT for any
-- sit.
--
-- After this migration members have exactly:
--   SELECT  their own photos
--   INSERT  their own photos, only for a sit they are the Nomad on
--   DELETE  their own photos, never flag evidence (unchanged, 20260930090000)
-- and no UPDATE at all. The admin SELECT policy is kept as it is.

-- Is the caller the Nomad on this sit?
CREATE OR REPLACE FUNCTION public.arrival_photo_sit_is_mine(p_sit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.sits s WHERE s.id = p_sit_id AND s.sitter_user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.arrival_photo_sit_is_mine(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arrival_photo_sit_is_mine(uuid) TO authenticated;

-- Remove every ALL or UPDATE policy, and any member SELECT or INSERT policy
-- (the admin SELECT policy, which checks is_admin, stays). The DELETE policy
-- from 20260930090000 is not touched.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'arrival_vault_photos'
      AND (
        cmd IN ('ALL', 'UPDATE')
        OR (cmd IN ('SELECT', 'INSERT')
            AND COALESCE(qual, '') NOT ILIKE '%is_admin%'
            AND COALESCE(with_check, '') NOT ILIKE '%is_admin%')
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.arrival_vault_photos', r.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "Nomads read their own arrival photos"
  ON public.arrival_vault_photos
  FOR SELECT
  TO authenticated
  USING (sitter_user_id = auth.uid());

CREATE POLICY "Nomads add arrival photos to their own sits"
  ON public.arrival_vault_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (sitter_user_id = auth.uid() AND public.arrival_photo_sit_is_mine(sit_id));

-- The app never updates these rows.
REVOKE UPDATE ON public.arrival_vault_photos FROM authenticated, anon;
