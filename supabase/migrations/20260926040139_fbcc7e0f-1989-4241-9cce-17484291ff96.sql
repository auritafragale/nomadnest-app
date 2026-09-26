-- ═══════════════════════════════════════════════════════════════════════════
-- Security hardening: applications
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Sitters can only INSERT applications with status 'applied', for a date
--    range that belongs to the same listing, on a published listing that isn't
--    their own. Enforced in the policy and, as defence in depth, in a
--    BEFORE INSERT trigger.
-- 2. UPDATE policies get explicit WITH CHECKs, and a BEFORE UPDATE trigger
--    allows only the status transitions the app uses:
--      sitter: applied/shortlisted -> withdrawn
--      owner:  applied -> shortlisted; applied/shortlisted -> declined/accepted
--    Nobody can change listing_id, sit_dates_id, sitter_user_id, message,
--    who_applying, highlights or created_at from the app.
-- 3. Active-application cap per date range raised from 5 to 10, with an error
--    message that doesn't mention a number.
-- 4. anon loses all table privileges (RLS already denied it everything).
--
-- HOW APP WRITES ARE DETECTED: the guard trigger functions are SECURITY
-- INVOKER and check current_user. Direct writes through the API run as
-- 'authenticated' (or 'anon'). Edge functions run as 'service_role', and
-- SECURITY DEFINER functions (e.g. cancel_applications_on_sit_cancel, which
-- sets status 'cancelled' when a sit is cancelled) run as their owner, so
-- those are not restricted by the guards.
--
-- Written to apply cleanly to both the repo's policy set and the live one
-- (every DROP is IF EXISTS).


-- ─── 1. INSERT ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Sitters can insert applications" ON public.applications;
CREATE POLICY "Sitters can insert applications"
ON public.applications
FOR INSERT
TO authenticated
WITH CHECK (
  sitter_user_id = auth.uid()
  AND status = 'applied'::public.application_status
  -- The date range must belong to the listing being applied to.
  AND EXISTS (
    SELECT 1 FROM public.sit_dates sd
    WHERE sd.id = applications.sit_dates_id
      AND sd.listing_id = applications.listing_id
  )
  -- The listing must be published and not the applicant's own.
  AND EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = applications.listing_id
      AND l.status = 'published'::public.listing_status
      AND l.owner_user_id <> auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.guard_application_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only direct app writes are restricted (see header).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'applied'::public.application_status THEN
    RAISE EXCEPTION 'New applications must have status applied'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_application_insert ON public.applications;
CREATE TRIGGER guard_application_insert
BEFORE INSERT ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.guard_application_insert();


-- ─── 2. UPDATE ──────────────────────────────────────────────────────────────

-- Repo name and both live sitter policies. The app never edits a pending
-- application's content, so "edit pending applications" is not recreated.
DROP POLICY IF EXISTS "Sitters can update own applications" ON public.applications;
DROP POLICY IF EXISTS "Sitters can edit pending applications" ON public.applications;
DROP POLICY IF EXISTS "Sitters can withdraw applications" ON public.applications;
DROP POLICY IF EXISTS "Owners can update applications for their listings" ON public.applications;

CREATE POLICY "Sitters can withdraw applications"
ON public.applications
FOR UPDATE
TO authenticated
USING (
  sitter_user_id = auth.uid()
  AND status IN ('applied'::public.application_status, 'shortlisted'::public.application_status)
)
WITH CHECK (
  sitter_user_id = auth.uid()
  AND status = 'withdrawn'::public.application_status
);

CREATE POLICY "Owners can update applications for their listings"
ON public.applications
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = applications.listing_id AND l.owner_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = applications.listing_id AND l.owner_user_id = auth.uid()
  )
  AND status IN (
    'shortlisted'::public.application_status,
    'accepted'::public.application_status,
    'declined'::public.application_status
  )
);

CREATE OR REPLACE FUNCTION public.guard_application_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
BEGIN
  -- Only direct app writes are restricted (see header).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.sit_dates_id IS DISTINCT FROM OLD.sit_dates_id
     OR NEW.sitter_user_id IS DISTINCT FROM OLD.sitter_user_id
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.who_applying IS DISTINCT FROM OLD.who_applying
     OR NEW.highlights IS DISTINCT FROM OLD.highlights
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Applications can''t be edited this way'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = OLD.listing_id AND l.owner_user_id = v_uid
  ) INTO v_is_owner;

  IF v_is_owner THEN
    IF (OLD.status = 'applied' AND NEW.status = 'shortlisted')
       OR (OLD.status IN ('applied', 'shortlisted') AND NEW.status IN ('declined', 'accepted')) THEN
      RETURN NEW;
    END IF;
  ELSIF v_uid IS NOT NULL AND v_uid = OLD.sitter_user_id THEN
    IF OLD.status IN ('applied', 'shortlisted') AND NEW.status = 'withdrawn' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'This application status change isn''t allowed'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS guard_application_update ON public.applications;
CREATE TRIGGER guard_application_update
BEFORE UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.guard_application_update();


-- ─── 3. Cap: 10 active applications per date range ─────────────────────────
-- Keep in step with MAX_ACTIVE_APPLICANTS in src/hooks/useApplicationSubmission.ts.

CREATE OR REPLACE FUNCTION public.enforce_application_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active integer;
BEGIN
  IF NEW.status NOT IN ('applied', 'shortlisted') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_active
  FROM public.applications
  WHERE sit_dates_id = NEW.sit_dates_id
    AND status IN ('applied', 'shortlisted')
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_active >= 10 THEN
    RAISE EXCEPTION 'This date range isn''t accepting new applications right now';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_application_cap() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_application_cap() TO service_role;


-- ─── 4. Grants ──────────────────────────────────────────────────────────────
-- RLS already denies anon everything here, and there is no DELETE policy.

REVOKE ALL ON public.applications FROM anon;
REVOKE DELETE, TRUNCATE ON public.applications FROM authenticated;