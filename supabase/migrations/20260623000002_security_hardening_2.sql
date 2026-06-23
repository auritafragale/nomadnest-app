-- ─── Security hardening (part 2) ─────────────────────────────────────────────
-- Fixes 3 remaining issues from Lovable security scanner.
-- All destructive steps use IF EXISTS / IF NOT EXISTS throughout.


-- ─── Fix 3: redeem_founding_member_code — enforce caller = beneficiary ────────
--
-- The original function accepted any UUID as p_user_id, meaning a logged-in
-- user could redeem a code on behalf of (and grant founding-member status to)
-- a different account. Adding an auth.uid() check closes this.
-- All other logic (FOR UPDATE counter, cap enforcement) is unchanged.

CREATE OR REPLACE FUNCTION public.redeem_founding_member_code(
  p_code    TEXT,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row founding_member_codes%ROWTYPE;
BEGIN
  -- Users may only redeem codes for their own account.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN 'invalid';
  END IF;

  -- Lock the specific code row for the duration of this transaction.
  SELECT * INTO v_row
  FROM public.founding_member_codes
  WHERE code = p_code AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'invalid';
  END IF;

  IF v_row.used_count >= v_row.max_uses THEN
    RETURN 'exhausted';
  END IF;

  -- Increment the counter atomically.
  UPDATE public.founding_member_codes
  SET used_count = used_count + 1
  WHERE id = v_row.id;

  -- Grant founding-member status to the caller's own profile.
  UPDATE public.profiles
  SET founding_member   = true,
      membership_status = 'active',
      membership_type   = 'combined',
      membership_expiry = (now() + INTERVAL '100 years')
  WHERE id = p_user_id;

  RETURN 'ok';
END;
$$;

-- Re-apply grants (CREATE OR REPLACE resets them)
REVOKE EXECUTE ON FUNCTION public.redeem_founding_member_code(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_founding_member_code(TEXT, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.redeem_founding_member_code(TEXT, UUID) TO authenticated;


-- ─── Fix 4: founding_member_codes — admin SELECT policy ──────────────────────
--
-- RLS is enabled on this table with no SELECT policy. Regular users do not need
-- to query it (the function handles everything). Admins need visibility for
-- monitoring usage counts and deactivating codes.

DROP POLICY IF EXISTS "Admins can view founding member codes" ON public.founding_member_codes;
CREATE POLICY "Admins can view founding member codes"
  ON public.founding_member_codes FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );


-- ─── Fix 5: listing-images upload policy scoped to uploader's folder ──────────
--
-- The old policy only checked bucket_id, allowing any authenticated user to
-- upload files into any path including paths owned by other users.
-- The replacement mirrors the id-verification-documents pattern:
-- uploads are only permitted under a top-level folder named after auth.uid().

DROP POLICY IF EXISTS "Authenticated users can upload listing images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload listing images" ON storage.objects;

CREATE POLICY "Users can upload own listing images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ─── Notes: intentionally deferred / manual-only items ───────────────────────
--
-- DEFERRED (post-launch): Phone column-level exposure to authenticated users.
--   profiles.phone_number, sitter_profiles.phone, owner_profiles.phone are
--   readable by any authenticated user. The serious vector (unauthenticated
--   access) was closed in migration 1. Column-level masking requires a
--   view-based refactor of all frontend .from("profiles") queries — deferred.
--
-- DEFERRED (irrelevant): Onfido webhook security — Onfido integration is
--   currently paused; no webhook endpoint is active.
--
-- MANUAL: Google Maps API key domain restriction.
--   Google Cloud Console → APIs & Services → Credentials → find the Maps key
--   → Application restrictions → HTTP referrers → add:
--     https://nomadnest.global/*
--     https://*.lovable.app/*
--
-- MANUAL: Leaked password protection (HIBP).
--   Supabase Dashboard → Authentication → Sign In / Up → Password
--   → enable "Leaked password protection" (if not already saved).
