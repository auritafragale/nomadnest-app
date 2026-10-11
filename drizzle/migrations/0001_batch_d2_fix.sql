-- Batch D2 fix (D2 is live).
--
-- 1. Applying and inviting failed for everyone. The app inserts with
--    .insert(...).select(), so the new row must pass the SELECT policy. The
--    policies called application_is_live(id) / invitation_is_live(id), which
--    looked the row up by id; inside the same INSERT the new row isn't
--    visible to that lookup, so they returned false and Postgres raised "new
--    row violates row-level security policy". The helpers now take the row's
--    own columns from the policy. They still keep membership private: they
--    answer only when the signed-in member is one of the two members of that
--    row (the Nomad, or the listing's owner / the inviting Pet Parent), and
--    false otherwise.
--    Other policies checked: listing_is_live(id) on listings is only reached
--    for rows the viewer doesn't own (an owner's own insert passes through
--    "auth.uid() = owner_user_id"), and on pets it looks up a different
--    table. Inserts with .select() on listings, pets, sit_dates,
--    conversations and messages don't use these helpers.
-- 2. A Nomad without Nomad access (no Nomad, Combined or Founding membership)
--    is hidden from Browse Nomads, Nomads Near Me, nomad-match and public
--    Nomad profiles until they renew; it comes back by itself. Pet Parents
--    they already deal with (an application, invitation or sit) still see
--    them, so existing chats and confirmed sits are unchanged. Inviting a
--    Nomad without access is refused with a neutral message.
--
-- profiles policies are NOT changed here.

-- ─── 1. Row helpers that take the row's own columns ────────────────────────

CREATE OR REPLACE FUNCTION public.application_is_live(
  p_status public.application_status,
  p_sitter_user_id uuid,
  p_listing_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  SELECT l.owner_user_id INTO v_owner FROM public.listings l WHERE l.id = p_listing_id;
  -- Only for the two members of this application.
  IF v_uid IS NULL OR v_owner IS NULL OR v_uid NOT IN (p_sitter_user_id, v_owner) THEN
    RETURN false;
  END IF;
  -- Decided applications are always live; pending ones only while both have their side.
  RETURN p_status NOT IN ('applied', 'shortlisted')
      OR (public.has_side_access(p_sitter_user_id, 'sitter') AND public.has_side_access(v_owner, 'owner'));
END;
$$;

REVOKE ALL ON FUNCTION public.application_is_live(public.application_status, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_is_live(public.application_status, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.invitation_is_live(p_status text, p_sitter_user_id uuid, p_owner_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR v_uid NOT IN (p_sitter_user_id, p_owner_user_id) THEN
    RETURN false;
  END IF;
  RETURN p_status NOT IN ('pending', 'viewed')
      OR (public.has_side_access(p_sitter_user_id, 'sitter') AND public.has_side_access(p_owner_user_id, 'owner'));
END;
$$;

REVOKE ALL ON FUNCTION public.invitation_is_live(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invitation_is_live(text, uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Sitters can view own applications" ON public.applications;
CREATE POLICY "Sitters can view own applications"
ON public.applications FOR SELECT TO authenticated
USING (
  sitter_user_id = auth.uid()
  AND public.application_is_live(status, sitter_user_id, listing_id)
);

DROP POLICY IF EXISTS "Owners can view applications for their listings" ON public.applications;
CREATE POLICY "Owners can view applications for their listings"
ON public.applications FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_user_id = auth.uid())
  AND public.application_is_live(status, sitter_user_id, listing_id)
);

DROP POLICY IF EXISTS "Owners can view sent invites" ON public.sitter_invites;
CREATE POLICY "Owners can view sent invites"
ON public.sitter_invites FOR SELECT TO authenticated
USING (
  auth.uid() = owner_user_id
  AND public.invitation_is_live(status, sitter_user_id, owner_user_id)
);

DROP POLICY IF EXISTS "Sitters can view received invites" ON public.sitter_invites;
CREATE POLICY "Sitters can view received invites"
ON public.sitter_invites FOR SELECT TO authenticated
USING (
  auth.uid() = sitter_user_id
  AND public.invitation_is_live(status, sitter_user_id, owner_user_id)
);

-- The old id-lookup versions are no longer used by anything.
DROP FUNCTION IF EXISTS public.application_is_live(uuid);
DROP FUNCTION IF EXISTS public.invitation_is_live(uuid);


-- ─── 2. Lapsed Nomads are hidden until they renew ──────────────────────────

-- A Nomad profile anyone may find: visible, active, and its member has
-- Nomad access. Keyed on the profile row the viewer is already looking at.
CREATE OR REPLACE FUNCTION public.nomad_profile_is_live(p_sitter_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT sp.is_visible IS TRUE AND sp.is_active IS TRUE AND public.has_side_access(sp.user_id, 'sitter')
    FROM public.sitter_profiles sp WHERE sp.id = p_sitter_profile_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.nomad_profile_is_live(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomad_profile_is_live(uuid) TO authenticated, service_role;

-- Browse Nomads, Nomads Near Me and Nomad profiles read through this. A
-- member's own profile, and Pet Parents they already deal with, still see it.
DROP POLICY IF EXISTS "Authenticated users can view sitter profiles" ON public.sitter_profiles;
CREATE POLICY "Authenticated users can view sitter profiles"
ON public.sitter_profiles FOR SELECT TO authenticated
USING (
  public.nomad_profile_is_live(id)
  OR auth.uid() = user_id
  OR public.nomad_profile_shared_with_me(user_id)
);

-- Inviting: the Pet Parent needs Pet Parent access, and the Nomad must have
-- Nomad access. For the second, a neutral message that never says why.
CREATE OR REPLACE FUNCTION public.require_owner_access_to_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.request_is_end_user() AND NOT public.has_side_access(NEW.owner_user_id, 'owner') THEN
    RAISE EXCEPTION 'You need a Pet Parent membership to invite Nomads.'
      USING ERRCODE = '42501', HINT = 'membership_needed';
  END IF;
  IF public.request_is_end_user() AND NOT public.has_side_access(NEW.sitter_user_id, 'sitter') THEN
    RAISE EXCEPTION 'This Nomad isn''t available for invitations right now.'
      USING ERRCODE = '42501', HINT = 'nomad_unavailable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_owner_access_to_invite() FROM PUBLIC, anon, authenticated;