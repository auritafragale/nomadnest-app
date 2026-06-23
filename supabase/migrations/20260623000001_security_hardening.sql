-- ─── Security hardening: 10 issues from Lovable security scanner ────────────
-- Applied as a single migration per production-safety guidelines.
-- All destructive steps use IF EXISTS / IF NOT EXISTS throughout.


-- ─── Issue 1: Prevent privilege escalation via profiles UPDATE ───────────────
--
-- Any authenticated user previously could SET is_admin = true on their own row
-- because the broad UPDATE policy had no column restrictions.
-- Fix: BEFORE UPDATE trigger that blocks elevation of sensitive columns.
-- The `current_user != 'authenticated'` guard lets SECURITY DEFINER functions
-- (sync_email_verified, redeem_founding_member_code) and service-role edge
-- functions (verify-phone-check) make legitimate changes unimpeded.

CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce for normal user requests (current_user = 'authenticated').
  -- postgres (SQL editor / SECURITY DEFINER callers) and service_role
  -- (admin-client edge functions) are allowed to make privileged changes.
  IF current_user != 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Block anyone who is not already an admin from changing is_admin.
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges to modify admin status';
  END IF;

  -- Block users from elevating their own trust / membership columns.
  IF auth.uid() = NEW.id THEN
    IF NEW.founding_member IS DISTINCT FROM OLD.founding_member THEN
      RAISE EXCEPTION 'Insufficient privileges to modify founding member status';
    END IF;
    IF NEW.membership_status IS DISTINCT FROM OLD.membership_status THEN
      RAISE EXCEPTION 'Insufficient privileges to modify membership status';
    END IF;
    IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
      RAISE EXCEPTION 'Insufficient privileges to modify email verified status';
    END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
      RAISE EXCEPTION 'Insufficient privileges to modify phone verified status';
    END IF;
    IF NEW.id_verified IS DISTINCT FROM OLD.id_verified THEN
      RAISE EXCEPTION 'Insufficient privileges to modify id verified status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();


-- ─── Issue 2: Remove over-permissive user_roles UPDATE policy ────────────────
--
-- The UPDATE policy (USING auth.uid() = user_id) let any user switch their own
-- role to anything — e.g. a sitter promoting themselves to owner. No frontend
-- code uses direct user_roles UPDATE calls (confirmed by codebase scan).
-- Role assignment is handled exclusively by handle_new_user() and Onboarding.

DROP POLICY IF EXISTS "Users can update own role" ON public.user_roles;


-- ─── Issue 3: Restrict profile SELECT policies to authenticated users ─────────
--
-- sitter_profiles and owner_profiles had no TO authenticated on their SELECT
-- policies, meaning unauthenticated visitors could read phone numbers and other
-- PII. profiles was already authenticated-only but is renamed for clarity.

-- profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- sitter_profiles — drop both the original name and the is_active-era name
DROP POLICY IF EXISTS "Anyone can view sitter profiles" ON public.sitter_profiles;
DROP POLICY IF EXISTS "Anyone can view active sitter profiles" ON public.sitter_profiles;
CREATE POLICY "Authenticated users can view sitter profiles"
  ON public.sitter_profiles FOR SELECT
  TO authenticated
  USING (is_active = true OR auth.uid() = user_id);

-- owner_profiles — same pattern
DROP POLICY IF EXISTS "Anyone can view owner profiles" ON public.owner_profiles;
DROP POLICY IF EXISTS "Anyone can view active owner profiles" ON public.owner_profiles;
CREATE POLICY "Authenticated users can view owner profiles"
  ON public.owner_profiles FOR SELECT
  TO authenticated
  USING (is_active = true OR auth.uid() = user_id);


-- ─── Issue 4: Realtime channel scoping ───────────────────────────────────────
--
-- REPLICA IDENTITY FULL is required so Supabase Realtime can evaluate RLS
-- policies on DELETE events (it needs the full old row to decide who should
-- receive the change). Both tables already have scoped RLS policies, so
-- Realtime will automatically filter to only the subscribing user's rows.

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;


-- ─── Warning: Revoke public EXECUTE on SECURITY DEFINER functions ─────────────
--
-- PostgreSQL grants EXECUTE to PUBLIC by default on all new functions.
-- Trigger-only functions should never be callable via the API.

-- Trigger-only functions: revoke all direct-call access
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;

REVOKE EXECUTE ON FUNCTION public.notify_push_on_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_insert() FROM anon;

REVOKE EXECUTE ON FUNCTION public.sync_email_verified() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_email_verified() FROM anon;

REVOKE EXECUTE ON FUNCTION public.prevent_privilege_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_privilege_escalation() FROM anon;

-- Utility function: authenticated users may call it (used by RLS-adjacent logic)
REVOKE EXECUTE ON FUNCTION public.get_user_role(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

-- Redemption function: authenticated-only (explicit grant already present;
-- this revoke closes the implicit PUBLIC grant)
REVOKE EXECUTE ON FUNCTION public.redeem_founding_member_code(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_founding_member_code(TEXT, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.redeem_founding_member_code(TEXT, UUID) TO authenticated;


-- ─── Notes: items that require manual action ─────────────────────────────────
--
-- 1. LEAKED PASSWORD PROTECTION (Warning from scanner)
--    Cannot be set via SQL. Go to:
--    Supabase Dashboard → Authentication → Sign In / Up → Password section
--    → enable "Leaked password protection" (HIBP integration).
--
-- 2. LISTING-IMAGES BUCKET public flag
--    Bucket is intentionally public: true so listing photos are accessible
--    via public URL to unauthenticated visitors (SEO / browse-without-login).
--    Directory listing is not exposed — there is no SELECT storage policy
--    without a path predicate. Lower-priority post-launch task.
