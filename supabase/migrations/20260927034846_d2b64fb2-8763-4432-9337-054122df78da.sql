-- ═══════════════════════════════════════════════════════════════════════════
-- Fix after privacy batch 3: admin policies that read profiles.is_admin
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Batch 3 made profiles.is_admin unreadable for members. Five policies still
-- checked admin status inline with
--   EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
-- Postgres evaluates every permissive policy for a command, so one of them
-- failing ("permission denied for table profiles") broke the whole query for
-- everyone, e.g. every member's storage read (chat, guide and update photos).
--
-- Each policy is recreated with the same command and meaning, using the
-- SECURITY DEFINER public.is_admin_user(auth.uid()) instead. The two
-- manual_id_verifications policies were TO public; they're now TO
-- authenticated: anon can never be an admin, and anon can't execute
-- is_admin_user (Postgres checks EXECUTE even when a policy wouldn't match).
--
-- Then a generic pass rewrites the same inline idiom in any other policy on
-- the live database, and warns about anything else that still reads a column
-- members lost in batch 3.
--
-- RULE FOR FUTURE POLICIES: never read profiles.is_admin (or any private
-- column) in a policy. Use public.is_admin_user(auth.uid()).


-- 1. ID documents (this one broke every member storage read)
DROP POLICY IF EXISTS "Admins can read all ID documents" ON storage.objects;
CREATE POLICY "Admins can read all ID documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'id-verification-documents' AND public.is_admin_user(auth.uid()));

-- 2 + 3. Manual ID verifications
DROP POLICY IF EXISTS "Admins can view all verifications" ON public.manual_id_verifications;
CREATE POLICY "Admins can view all verifications"
ON public.manual_id_verifications FOR SELECT TO authenticated
USING (public.is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can update verifications" ON public.manual_id_verifications;
CREATE POLICY "Admins can update verifications"
ON public.manual_id_verifications FOR UPDATE TO authenticated
USING (public.is_admin_user(auth.uid()));

-- 4. Founding member codes
DROP POLICY IF EXISTS "Admins can view founding member codes" ON public.founding_member_codes;
CREATE POLICY "Admins can view founding member codes"
ON public.founding_member_codes FOR SELECT TO authenticated
USING (public.is_admin_user(auth.uid()));

-- 5. Admin-created notifications
DROP POLICY IF EXISTS "Admins can insert notifications" ON public.notifications;
CREATE POLICY "Admins can insert notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (public.is_admin_user(auth.uid()));


-- ─── Generic pass for policies created outside the repo ────────────────────

DO $$
DECLARE
  r record;
  -- The inline admin idiom exactly as Postgres prints it, e.g.
  --   EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))
  -- (either condition order, optional alias). Only the EXISTS's own brackets
  -- are matched, so the surrounding expression stays balanced.
  v_pat1 text := 'EXISTS \( SELECT 1\s+FROM (public\.)?profiles( \w+)?\s+WHERE \(\((\w+\.)?id = auth\.uid\(\)\) AND \((\w+\.)?is_admin = true\)\)\)';
  v_pat2 text := 'EXISTS \( SELECT 1\s+FROM (public\.)?profiles( \w+)?\s+WHERE \(\((\w+\.)?is_admin = true\) AND \((\w+\.)?id = auth\.uid\(\)\)\)\)';
  v_qual text;
  v_check text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (COALESCE(qual, '') ~* 'is_admin\s*=' OR COALESCE(with_check, '') ~* 'is_admin\s*=')
  LOOP
    v_qual := regexp_replace(regexp_replace(r.qual, v_pat1, 'public.is_admin_user(auth.uid())', 'gi'),
                             v_pat2, 'public.is_admin_user(auth.uid())', 'gi');
    v_check := regexp_replace(regexp_replace(r.with_check, v_pat1, 'public.is_admin_user(auth.uid())', 'gi'),
                              v_pat2, 'public.is_admin_user(auth.uid())', 'gi');
    IF v_qual IS DISTINCT FROM r.qual THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.policyname, r.schemaname, r.tablename, v_qual);
      RAISE NOTICE 'Rewrote USING of policy "%" on %.%', r.policyname, r.schemaname, r.tablename;
    END IF;
    IF v_check IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, v_check);
      RAISE NOTICE 'Rewrote WITH CHECK of policy "%" on %.%', r.policyname, r.schemaname, r.tablename;
    END IF;
  END LOOP;

  -- Anything left that reads a column members lost in batch 3.
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) ~*
          '(is_admin\s*=|\memail\M|membership_|onfido_|preferred_language|flagged_for_admin_review|flag_(abandonment|home_cleanliness|pet_aggression|pet_neglect|sitter_cleanliness|unauthorized_guests|undisclosed_cameras)|social_links|\mphone\M|\mlatitude\M|\mlongitude\M)'
  LOOP
    RAISE WARNING 'Policy "%" on %.% still reads a column members lost in batch 3: fix it by hand', r.policyname, r.schemaname, r.tablename;
  END LOOP;
END;
$$;